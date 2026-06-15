'use client';

import { useEffect, useState } from 'react';
import { currentEligiblePlayer, shouldReveal, type PredictionRecord } from '@/lib/domain';
import { dashboardModel } from '@/lib/mock-data';
import { PredictionCard, type ExtendedPrediction } from './PredictionCard';

const storedPredictionsKey = 'wc2026.predictions.v1';

type StoredPrediction = ExtendedPrediction & { fixtureId: string };

function withDefaultOptions(prediction: PredictionRecord & { fixtureId: string }): StoredPrediction {
  return {
    ...prediction,
    submittedAt: new Date(prediction.submittedAt),
    possession: 'NA',
    firstGoalscorer: 'NA',
    extraTimeApplicable: false,
    penaltiesApplicable: false,
  };
}

function revivePrediction(prediction: StoredPrediction): StoredPrediction {
  return withDefaultOptions(prediction);
}

export function Dashboard() {
  const model = dashboardModel();
  const [predictions, setPredictions] = useState<StoredPrediction[]>(model.predictions.map(withDefaultOptions));

  useEffect(() => {
    const stored = window.localStorage.getItem(storedPredictionsKey);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as StoredPrediction[];
      setPredictions(parsed.map(revivePrediction));
    } catch {
      window.localStorage.removeItem(storedPredictionsKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storedPredictionsKey, JSON.stringify(predictions));
  }, [predictions]);

  function recordPrediction(prediction: StoredPrediction) {
    setPredictions((existing) => {
      const withoutDuplicate = existing.filter((candidate) => !(candidate.fixtureId === prediction.fixtureId && candidate.userName === prediction.userName));
      return [...withoutDuplicate, prediction];
    });
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="glass rounded-3xl p-6 md:p-10">
          <p className="text-flood text-sm uppercase tracking-[.35em]">FIFA World Cup 2026</p>
          <h1 className="mt-3 text-4xl font-black md:text-7xl">Friends Prediction Arena</h1>
          <p className="mt-4 text-white/70">Daily order rotates from {model.referenceRotationDate} in {model.timezone}. Today: {model.order.join(' → ')}.</p>
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
            const predictionRecords: PredictionRecord[] = fixturePredictions;

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
                  {reveal ? predictionRecords.map((prediction) => <p key={prediction.userName}>{prediction.userName}: {prediction.homeScore}-{prediction.awayScore}</p>) : <p className="text-white/60">Hidden until all players submit or kickoff passes.</p>}
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
