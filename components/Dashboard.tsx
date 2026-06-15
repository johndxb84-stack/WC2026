'use client';

import { useEffect, useState } from 'react';
import { currentEligiblePlayer, shouldReveal, type PredictionRecord } from '@/lib/domain';
import { dashboardModel } from '@/lib/mock-data';
import { PredictionCard, type ExtendedPrediction } from './PredictionCard';

const storedPredictionsKey = 'wc2026.predictions.v1';

type StoredPrediction = ExtendedPrediction & { fixtureId: string };
type PredictionBackup = { predictions: StoredPrediction[]; resetAt: string | null };

function withDefaultOptions(prediction: PredictionRecord & { fixtureId: string } & Partial<StoredPrediction>): StoredPrediction {
  return {
    ...prediction,
    submittedAt: new Date(prediction.submittedAt),
    possession: prediction.possession ?? 'NA',
    firstGoalscorer: prediction.firstGoalscorer ?? 'NA',
    extraTimeApplicable: prediction.extraTimeApplicable ?? false,
    homeScoreExtraTime: prediction.homeScoreExtraTime,
    awayScoreExtraTime: prediction.awayScoreExtraTime,
    penaltiesApplicable: prediction.penaltiesApplicable ?? false,
    homePenaltyScore: prediction.homePenaltyScore,
    awayPenaltyScore: prediction.awayPenaltyScore,
  };
}

function revivePrediction(prediction: StoredPrediction): StoredPrediction {
  return withDefaultOptions(prediction);
}

function predictionKey(prediction: StoredPrediction) {
  return `${prediction.fixtureId}:${prediction.userName}`;
}

function mergePredictions(primary: StoredPrediction[], backup: StoredPrediction[]) {
  const merged = new Map<string, StoredPrediction>();

  for (const prediction of [...backup, ...primary]) {
    const existing = merged.get(predictionKey(prediction));
    if (!existing || new Date(prediction.submittedAt).getTime() >= new Date(existing.submittedAt).getTime()) {
      merged.set(predictionKey(prediction), prediction);
    }
  }

  return [...merged.values()];
}

function formatOptional(value: unknown) {
  if (value === undefined || value === null || value === '' || value === 'NA') return 'N/A';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return String(value);
}

function formatScore(home?: number, away?: number) {
  return typeof home === 'number' && typeof away === 'number' ? `${home}-${away}` : 'N/A';
}

export function Dashboard() {
  const model = dashboardModel();
  const [predictions, setPredictions] = useState<StoredPrediction[]>(model.predictions.map(withDefaultOptions));
  const [syncStatus, setSyncStatus] = useState('Loading shared predictions…');
  const [resetAt, setResetAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSharedPredictions() {
      const localBackup = readLocalBackup();

      try {
        const response = await fetch('/api/predictions', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to load shared predictions');
        const payload = await response.json() as { predictions: StoredPrediction[]; persistence: string; resetAt: string | null };
        if (!active) return;

        const remotePredictions = payload.predictions.map(revivePrediction);
        const remoteResetIsNewer = payload.resetAt && (!localBackup.resetAt || new Date(payload.resetAt).getTime() > new Date(localBackup.resetAt).getTime());
        const localPredictions = remoteResetIsNewer ? [] : localBackup.predictions;
        const mergedPredictions = mergePredictions(remotePredictions, localPredictions);
        setPredictions(mergedPredictions);
        setResetAt(payload.resetAt);

        if (!remoteResetIsNewer && localPredictions.length > 0 && mergedPredictions.length > remotePredictions.length) {
          await saveAllPredictions(mergedPredictions);
          setSyncStatus('Restored local backup to shared store');
          return;
        }

        setSyncStatus(payload.persistence === 'redis' ? 'Synced globally' : 'Temporary server memory - configure Vercel KV for worldwide sync');
      } catch {
        if (localBackup.predictions.length === 0) {
          setSyncStatus('Offline fallback only - shared store unavailable');
          return;
        }

        if (active) setPredictions(localBackup.predictions);
        setResetAt(localBackup.resetAt);
        setSyncStatus('Offline fallback loaded from this browser');
      }
    }

    loadSharedPredictions();
    const interval = window.setInterval(loadSharedPredictions, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storedPredictionsKey, JSON.stringify({ predictions, resetAt }));
  }, [predictions, resetAt]);

  function readLocalBackup(): PredictionBackup {
    const stored = window.localStorage.getItem(storedPredictionsKey);
    if (!stored) return { predictions: [], resetAt: null };

    try {
      const parsed = JSON.parse(stored) as PredictionBackup | StoredPrediction[];
      if (Array.isArray(parsed)) return { predictions: parsed.map(revivePrediction), resetAt: null };
      return { predictions: (parsed.predictions ?? []).map(revivePrediction), resetAt: parsed.resetAt ?? null };
    } catch {
      return { predictions: [], resetAt: null };
    }
  }


  async function saveAllPredictions(nextPredictions: StoredPrediction[]) {
    const response = await fetch('/api/predictions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictions: nextPredictions }),
    });
    if (!response.ok) throw new Error('Could not restore predictions');
  }

  async function restoreLocalBackup() {
    const localBackup = readLocalBackup();
    if (localBackup.predictions.length === 0) {
      setSyncStatus('No local backup found on this browser');
      return;
    }

    setPredictions(localBackup.predictions);
    setResetAt(localBackup.resetAt);
    await saveAllPredictions(localBackup.predictions);
    setSyncStatus('Local backup restored to shared store');
  }

  async function downloadBackup() {
    try {
      const response = await fetch('/api/predictions', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not download backup');
      const backup = await response.json();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wc2026-predictions-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSyncStatus('Backup downloaded');
    } catch {
      setSyncStatus('Could not download backup');
    }
  }

  async function resetPredictions() {
    setPredictions([]);
    window.localStorage.removeItem(storedPredictionsKey);

    try {
      const response = await fetch('/api/predictions', { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not reset shared predictions');
      const payload = await response.json() as { resetAt?: string | null };
      setResetAt(payload.resetAt ?? new Date().toISOString());
      window.localStorage.setItem(storedPredictionsKey, JSON.stringify({ predictions: [], resetAt: payload.resetAt ?? new Date().toISOString() }));
      setSyncStatus('Bets reset everywhere - Nicolas is back on turn');
    } catch {
      setSyncStatus('Local bets reset, but shared reset failed');
    }
  }

  async function recordPrediction(prediction: StoredPrediction) {
    const applyPrediction = (existing: StoredPrediction[]) => {
      const withoutDuplicate = existing.filter((candidate) => !(candidate.fixtureId === prediction.fixtureId && candidate.userName === prediction.userName));
      return [...withoutDuplicate, prediction];
    };

    setPredictions(applyPrediction);

    try {
      const response = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prediction),
      });
      const payload = await response.json() as { predictions?: StoredPrediction[]; persistence?: string; reason?: string; resetAt?: string | null };
      if (!response.ok) throw new Error(payload.reason ?? 'Prediction rejected');
      if (payload.predictions) setPredictions(payload.predictions.map(revivePrediction));
      setResetAt(payload.resetAt ?? null);
      setSyncStatus(payload.persistence === 'redis' ? 'Synced globally' : 'Saved on server memory - configure Vercel KV for durable worldwide sync');
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Could not save shared prediction');
    }
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="glass rounded-3xl p-6 md:p-10">
          <p className="text-flood text-sm uppercase tracking-[.35em]">FIFA World Cup 2026</p>
          <h1 className="mt-3 text-4xl font-black md:text-7xl">Friends Prediction Arena</h1>
          <p className="mt-4 text-white/70">Daily order rotates from {model.referenceRotationDate} in {model.timezone}. Today: {model.order.join(' → ')}.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="rounded-full bg-white/10 px-4 py-2 text-sm text-flood">{syncStatus}</p>
            <button className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/80" onClick={downloadBackup} type="button">Download backup</button>
            <button className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/80" onClick={restoreLocalBackup} type="button">Restore local backup</button>
            <button className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/80" onClick={resetPredictions} type="button">Reset bets</button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {model.players.map((player, index) => (
            <div className="glass rounded-2xl p-5" key={player.name}>
              <div className="text-3xl">#{index + 1}</div>
              <h2 className="text-2xl font-bold">{player.name}</h2>
              <p className="text-gold">{player.totalPoints} pts</p>
            </div>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {model.fixtures.map((fixture) => {
            const fixturePredictions = predictions.filter((prediction) => prediction.fixtureId === fixture.id);
            const current = currentEligiblePlayer(model.order, fixturePredictions);
            const currentIndex = current ? model.order.indexOf(current) : -1;
            const nextPlayer = currentIndex >= 0 ? model.order[currentIndex + 1] : undefined;
            const reveal = shouldReveal(model.order, fixturePredictions, { id: fixture.id, kickoff: fixture.kickoff });
            const predictionRecords = fixturePredictions;

            return (
              <article className="glass rounded-3xl p-6" key={fixture.id}>
                <div className="flex justify-between text-sm text-white/60">
                  <span>{fixture.venue}</span>
                  <span>{fixture.kickoff.toLocaleString('en-GB', { timeZone: model.timezone })}</span>
                </div>
                <div className="my-6 flex items-center justify-between text-2xl font-black md:text-3xl">
                  <span>{fixture.homeLogo} {fixture.homeTeam}</span>
                  <span className="text-flood">vs</span>
                  <span>{fixture.awayTeam} {fixture.awayLogo}</span>
                </div>
                <div className="rounded-2xl bg-black/25 p-4">
                  <p><b>Current turn:</b> <span className="text-gold">{current ?? 'All submitted'}</span></p>
                  <p><b>Next player:</b> {nextPlayer ?? '—'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {model.order.map((name) => {
                      const prediction = fixturePredictions.find((candidate) => candidate.userName === name);
                      return <span className="rounded-full bg-white/10 px-3 py-1" key={name}>{name}: {prediction ? 'Submitted' : name === current ? 'Your turn' : 'Waiting'}</span>;
                    })}
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="font-bold">Predictions</h3>
                  {reveal ? (
                    <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-white/10 text-white">
                          <tr>
                            <th className="p-3">Player</th>
                            <th className="p-3">90-min score</th>
                            <th className="p-3">Possession</th>
                            <th className="p-3">First scorer</th>
                            <th className="p-3">Extra time</th>
                            <th className="p-3">Penalties</th>
                          </tr>
                        </thead>
                        <tbody>
                          {predictionRecords.map((prediction) => (
                            <tr className="border-t border-white/10 text-white/80" key={prediction.userName}>
                              <td className="p-3 font-bold text-white">{prediction.userName}</td>
                              <td className="p-3">{prediction.homeScore}-{prediction.awayScore}</td>
                              <td className="p-3">{formatOptional(prediction.possession)}</td>
                              <td className="p-3">{formatOptional(prediction.firstGoalscorer)}</td>
                              <td className="p-3">{prediction.extraTimeApplicable ? formatScore(prediction.homeScoreExtraTime, prediction.awayScoreExtraTime) : 'N/A'}</td>
                              <td className="p-3">{prediction.penaltiesApplicable ? formatScore(prediction.homePenaltyScore, prediction.awayPenaltyScore) : 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-white/60">Hidden until all players submit or kickoff passes.</p>}
                </div>
                <PredictionCard fixture={fixture} order={model.order} initialPredictions={predictionRecords} onPredictionSubmitted={recordPrediction} />
                <a className="mt-5 inline-block rounded-full bg-flood px-5 py-2 font-bold text-pitch" href={`/matches/${fixture.id}`}>Match details</a>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
