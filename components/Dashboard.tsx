'use client';
import { useEffect, useState } from 'react';
import { currentEligiblePlayer, dailyOrder, dateKeyInTimezone, referenceRotationDate, shouldReveal } from '@/lib/domain';
import type { StoredResult } from '@/lib/results-store';

const TIMEZONE = 'Asia/Dubai';
const POLL_MS = 10_000;

const FLAG: Record<string, string> = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'United States': '🇺🇸', 'Canada': '🇨🇦',
  'Brazil': '🇧🇷', 'Argentina': '🇦🇷', 'France': '🇫🇷', 'Germany': '🇩🇪',
  'Spain': '🇪🇸', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Portugal': '🇵🇹', 'Netherlands': '🇳🇱',
  'Morocco': '🇲🇦', 'Japan': '🇯🇵', 'South Korea': '🇰🇷', 'Australia': '🇦🇺',
  'Saudi Arabia': '🇸🇦', 'Senegal': '🇸🇳', 'Ghana': '🇬🇭', 'Nigeria': '🇳🇬',
  'Ecuador': '🇪🇨', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴', 'Chile': '🇨🇱',
  'Costa Rica': '🇨🇷', 'Honduras': '🇭🇳', 'Panama': '🇵🇦', 'Qatar': '🇶🇦',
  'Iran': '🇮🇷', 'IR Iran': '🇮🇷', 'Turkey': '🇹🇷', 'Poland': '🇵🇱', 'Switzerland': '🇨🇭',
  'Belgium': '🇧🇪', 'Denmark': '🇩🇰', 'Croatia': '🇭🇷', 'Serbia': '🇷🇸',
  'Ukraine': '🇺🇦', 'Romania': '🇷🇴', 'New Zealand': '🇳🇿',
  'Cabo Verde': '🇨🇻', 'Egypt': '🇪🇬', 'Iraq': '🇮🇶', 'Norway': '🇳🇴',
  'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴', 'DR Congo': '🇨🇩',
  'Uzbekistan': '🇺🇿',
};

type TeamInfo = { name: string; shortName: string | null; logoUrl: string | null };
type ApiFixture = {
  id: string;
  scheduledKickoff: string;
  venue: string | null;
  status: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
};
type ApiPrediction = {
  id: string;
  fixtureId: string;
  user: { name: string };
  predictedHomeScore90: number | null;
  predictedAwayScore90: number | null;
  submittedAt: string | null;
  status: string;
  score: { totalPoints: number } | null;
};
type ApiPlayer = { id: string; name: string; avatarUrl: string | null; totalPoints: number };
type DashboardData = { fixtures: ApiFixture[]; predictions: ApiPrediction[]; players: ApiPlayer[]; results?: Record<string, StoredResult> };

function toDomainPreds(predictions: ApiPrediction[], fixtureId: string) {
  return predictions
    .filter(p => p.fixtureId === fixtureId && p.status !== 'WAITING' && p.submittedAt)
    .map(p => ({
      userName: p.user.name,
      homeScore: p.predictedHomeScore90 ?? 0,
      awayScore: p.predictedAwayScore90 ?? 0,
      submittedAt: new Date(p.submittedAt!),
      forfeited: p.status === 'FORFEITED',
    }));
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncAge, setSyncAge] = useState(0);

  const load = () =>
    fetch('/api/predictions')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<DashboardData>;
      })
      .then(d => { setData(d); setError(null); setLastSynced(new Date()); })
      .catch(() => setError('Failed to load data. Retrying…'));

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    // Refresh immediately when the tab becomes visible again (user switching devices/apps)
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Update "X seconds ago" label every second
  useEffect(() => {
    const t = setInterval(() => {
      if (lastSynced) setSyncAge(Math.floor((Date.now() - lastSynced.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastSynced]);

  if (error && !data) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-white/60">Loading…</p>
      </main>
    );
  }

  const now = new Date();
  const todayKey = dateKeyInTimezone(now, TIMEZONE);
  const todayOrder = dailyOrder(now);
  const sortedPlayers = [...data.players].sort((a, b) => b.totalPoints - a.totalPoints);

  // Include today's Dubai matches PLUS early-morning next-Dubai-day matches that are
  // still the same evening in the US (WC2026 last slot = ~10pm ET = ~06:00 Dubai next day)
  const tomorrowKey = dateKeyInTimezone(new Date(now.getTime() + 24 * 60 * 60 * 1000), TIMEZONE);
  const todayFixtures = data.fixtures.filter(f => {
    const kickoff = new Date(f.scheduledKickoff);
    const kickoffKey = dateKeyInTimezone(kickoff, TIMEZONE);
    if (kickoffKey === todayKey) return true;
    if (kickoffKey === tomorrowKey) {
      // Include early-morning next-Dubai-day games (before 10:00 Dubai = still US same day)
      const kickoffHourDubai = (kickoff.getUTCHours() + 4) % 24;
      return kickoffHourDubai < 10;
    }
    return false;
  }).sort((a, b) => new Date(a.scheduledKickoff).getTime() - new Date(b.scheduledKickoff).getTime());

  return (
    <main className="min-h-screen p-4 md:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="glass rounded-3xl p-6 md:p-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-flood uppercase tracking-[.35em] text-sm">FIFA World Cup 2026</p>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>Live · synced {syncAge < 5 ? 'just now' : `${syncAge}s ago`}</span>
              <button onClick={() => load()} className="ml-1 text-flood hover:text-white transition-colors">↻ Refresh</button>
            </div>
          </div>
          <h1 className="text-4xl md:text-7xl font-black mt-3">Prediction Arena</h1>
          <p className="mt-4 text-white/70">
            Today&apos;s order: <span className="text-flood font-semibold">{todayOrder.join(' → ')}</span>
          </p>
          {error && <p className="mt-2 text-yellow-400 text-sm">{error}</p>}
        </div>

        {/* Leaderboard */}
        <div>
          <p className="text-white/50 uppercase tracking-widest text-xs mb-3">Leaderboard</p>
          <div className="grid md:grid-cols-3 gap-4">
            {sortedPlayers.map((p, i) => (
              <div className="glass rounded-2xl p-5" key={p.name}>
                <div className="text-3xl text-white/30">#{i + 1}</div>
                <h2 className="text-2xl font-bold mt-1">{p.name}</h2>
                <p className="text-gold text-lg font-semibold">{p.totalPoints} pts</p>
              </div>
            ))}
          </div>
        </div>

        {/* Today's matches */}
        <div>
          <p className="text-white/50 uppercase tracking-widest text-xs mb-3">
            Today&apos;s matches — {todayKey} Dubai (incl. early morning next day)
          </p>
          {todayFixtures.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-white/50">No matches scheduled today.</div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-5">
              {todayFixtures.map(f => {
                const kickoff = new Date(f.scheduledKickoff);
                const fixtureOrder = dailyOrder(kickoff);
                const preds = toDomainPreds(data.predictions, f.id);
                const current = currentEligiblePlayer(fixtureOrder, preds);
                const reveal = shouldReveal(fixtureOrder, preds, { id: f.id, kickoff }, now);
                const isLocked = now >= kickoff;
                const result = data.results?.[f.id];

                return (
                  <article className="glass rounded-3xl p-6" key={f.id}>
                    <div className="flex justify-between text-sm text-white/60">
                      <span>{f.venue}</span>
                      <span>{kickoff.toLocaleString('en-GB', { timeZone: TIMEZONE })}</span>
                    </div>
                    <div className="my-5 flex items-center justify-between text-2xl md:text-3xl font-black">
                      <span>{FLAG[f.homeTeam.name] ?? ''} {f.homeTeam.name}</span>
                      <span className="text-flood">vs</span>
                      <span>{f.awayTeam.name} {FLAG[f.awayTeam.name] ?? ''}</span>
                    </div>

                    {result && (
                      <div className="rounded-xl bg-flood/10 border border-flood/20 px-4 py-2 mb-3 text-sm">
                        <span className="text-flood font-semibold">Result: </span>
                        <span>{f.homeTeam.name} {result.homeScore90}–{result.awayScore90} {f.awayTeam.name}</span>
                      </div>
                    )}

                    <div className="rounded-2xl bg-black/25 p-4">
                      {isLocked ? (
                        <p className="text-sm text-yellow-400">Betting closed — match has started.</p>
                      ) : (
                        <>
                          <p className="text-sm">
                            <b>Current turn:</b>{' '}
                            <span className="text-flood">{current ?? 'All submitted'}</span>
                          </p>
                          {current && (
                            <p className="text-sm text-white/60">
                              Next: {(fixtureOrder as string[])[(fixtureOrder as string[]).indexOf(current) + 1] ?? '—'}
                            </p>
                          )}
                        </>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {fixtureOrder.map(name => {
                          const pred = preds.find(p => p.userName === name);
                          return (
                            <span
                              key={name}
                              className={`rounded-full px-3 py-1 text-sm ${
                                pred ? 'bg-green-500/20 text-green-300' :
                                name === current ? 'bg-flood/20 text-flood font-semibold' :
                                'bg-white/10 text-white/50'
                              }`}
                            >
                              {pred ? `✓ ${name}` : name === current ? `⏳ ${name}` : name}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {reveal && preds.length > 0 && (
                      <div className="mt-3">
                        {preds.map(p => (
                          <p key={p.userName} className="text-sm text-white/70">
                            {p.userName}: {p.homeScore}–{p.awayScore}
                          </p>
                        ))}
                      </div>
                    )}
                    {!reveal && (
                      <p className="mt-3 text-sm text-white/40">Predictions hidden until all submit or kickoff.</p>
                    )}

                    <a
                      className="mt-4 inline-block rounded-full bg-flood px-5 py-2 font-bold text-pitch text-sm"
                      href={`/matches/${f.id}`}
                    >
                      {isLocked ? 'View match' : 'Place bet →'}
                    </a>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
