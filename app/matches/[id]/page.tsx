'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { dailyOrder, shouldReveal } from '@/lib/domain';

const TIMEZONE = 'Asia/Dubai';
const POLL_MS = 30_000;

type TeamInfo = { name: string; shortName: string | null };
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
type ApiPlayer = { id: string; name: string; totalPoints: number };
type DashboardData = { fixtures: ApiFixture[]; predictions: ApiPrediction[]; players: ApiPlayer[] };

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const load = () =>
      fetch('/api/predictions')
        .then(r => r.json() as Promise<DashboardData>)
        .then(setData)
        .catch(console.error);
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  if (!data) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-white/60">Loading…</p>
      </main>
    );
  }

  const fixture = data.fixtures.find(f => f.id === id);
  if (!fixture) return <main className="p-8 text-white/60">Match not found.</main>;

  const kickoff = new Date(fixture.scheduledKickoff);
  const fixtureOrder = dailyOrder(kickoff);
  const now = new Date();

  const preds = data.predictions
    .filter(p => p.fixtureId === fixture.id && p.status !== 'WAITING' && p.submittedAt)
    .map(p => ({
      userName: p.user.name,
      homeScore: p.predictedHomeScore90 ?? 0,
      awayScore: p.predictedAwayScore90 ?? 0,
      submittedAt: new Date(p.submittedAt!),
      forfeited: p.status === 'FORFEITED',
    }));

  const reveal = shouldReveal(fixtureOrder, preds, { id: fixture.id, kickoff }, now);

  return (
    <main className="min-h-screen p-6">
      <div className="glass rounded-3xl p-8 max-w-5xl mx-auto">
        <a href="/" className="text-flood">← Dashboard</a>
        <h1 className="text-4xl font-black mt-4">{fixture.homeTeam.name} vs {fixture.awayTeam.name}</h1>
        <p className="text-white/70">
          {fixture.venue} · {fixture.status} · {kickoff.toLocaleString('en-GB', { timeZone: TIMEZONE })}
        </p>

        <h2 className="mt-8 text-2xl font-bold">Prediction comparison</h2>
        <table className="mt-4 w-full text-left">
          <thead>
            <tr className="text-white/60 text-sm">
              <th className="pb-2">Player</th>
              <th className="pb-2">90-min prediction</th>
              <th className="pb-2">Points</th>
            </tr>
          </thead>
          <tbody>
            {fixtureOrder.map(name => {
              const pred = preds.find(p => p.userName === name);
              const raw = data.predictions.find(p => p.user.name === name && p.fixtureId === fixture.id);
              return (
                <tr className="border-t border-white/10" key={name}>
                  <td className="py-3 font-semibold">{name}</td>
                  <td className="py-3">
                    {!pred
                      ? <span className="text-white/40">Waiting</span>
                      : reveal
                        ? `${pred.homeScore}–${pred.awayScore}`
                        : <span className="text-white/60">Submitted (hidden)</span>}
                  </td>
                  <td className="py-3 text-gold">{raw?.score?.totalPoints ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
