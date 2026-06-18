'use client';
import { useEffect, useState } from 'react';
import { scorePrediction } from '@/lib/domain';
import { flag } from '@/lib/flags';
import type { StoredResult } from '@/lib/results-store';

const POLL_MS = 15_000;

type TeamInfo = { name: string };
type ApiFixture = { id: string; scheduledKickoff: string; homeTeam: TeamInfo; awayTeam: TeamInfo };
type ApiPrediction = {
  fixtureId: string; user: { name: string };
  predictedHomeScore90: number | null; predictedAwayScore90: number | null;
  possession: string | null; firstGoalscorer: string | null;
  homeScoreExtraTime: number | null; awayScoreExtraTime: number | null;
  homePenaltyScore: number | null; awayPenaltyScore: number | null;
  submittedAt: string | null; status: string;
};
type ApiPlayer = { id: string; name: string; totalPoints: number };
type Data = { fixtures: ApiFixture[]; predictions: ApiPrediction[]; players: ApiPlayer[]; results?: Record<string, StoredResult> };

type PlayerStat = {
  name: string;
  totalPoints: number;
  settled: number;
  gamePoints: number;
  correct: number;
  exact: number;
  possession: number;
  scorer: number;
  matchWins: number;
  streak: number;
  bestStreak: number;
};

function computeStats(data: Data): PlayerStat[] {
  const fixturesById = new Map(data.fixtures.map(f => [f.id, f]));
  const settledFixtures = data.fixtures
    .filter(f => data.results?.[f.id])
    .sort((a, b) => new Date(a.scheduledKickoff).getTime() - new Date(b.scheduledKickoff).getTime());

  const base = new Map<string, PlayerStat>();
  for (const p of data.players) {
    base.set(p.name, {
      name: p.name, totalPoints: p.totalPoints, settled: 0, gamePoints: 0,
      correct: 0, exact: 0, possession: 0, scorer: 0, matchWins: 0, streak: 0, bestStreak: 0,
    });
  }

  // per-player ordered timeline of points (for streaks) and per-fixture tally (for head-to-head)
  const timeline = new Map<string, number[]>();
  for (const name of base.keys()) timeline.set(name, []);

  for (const f of settledFixtures) {
    const result = data.results![f.id];
    const fixtureForScore = {
      id: f.id, kickoff: new Date(f.scheduledKickoff),
      homeScore90: result.homeScore90, awayScore90: result.awayScore90,
      homePossession: result.homePossession, awayPossession: result.awayPossession,
      firstGoalscorerId: result.firstGoalscorer ?? null,
      homeScoreExtraTime: result.homeScoreExtraTime ?? null, awayScoreExtraTime: result.awayScoreExtraTime ?? null,
      homePenaltyScore: result.homePenaltyScore ?? null, awayPenaltyScore: result.awayPenaltyScore ?? null,
    };
    const perPlayerPoints = new Map<string, number>();
    for (const pred of data.predictions) {
      if (pred.fixtureId !== f.id || !pred.submittedAt) continue;
      const stat = base.get(pred.user.name);
      if (!stat) continue;
      const s = scorePrediction({
        homeScore: pred.predictedHomeScore90 ?? 0, awayScore: pred.predictedAwayScore90 ?? 0,
        possession: pred.possession as 'HOME' | 'AWAY' | 'EQUAL' | undefined,
        firstGoalscorerId: pred.firstGoalscorer ?? null,
        homeScoreExtraTime: pred.homeScoreExtraTime ?? null, awayScoreExtraTime: pred.awayScoreExtraTime ?? null,
        homePenaltyScore: pred.homePenaltyScore ?? null, awayPenaltyScore: pred.awayPenaltyScore ?? null,
      }, fixtureForScore);
      stat.settled++;
      stat.gamePoints += s.totalPoints;
      if (s.outcomePoints > 0) stat.correct++;
      if (s.exactScorePoints > 0) stat.exact++;
      if (s.possessionPoints > 0) stat.possession++;
      if (s.firstGoalscorerPoints > 0) stat.scorer++;
      perPlayerPoints.set(pred.user.name, s.totalPoints);
      timeline.get(pred.user.name)!.push(s.totalPoints);
    }
    // head-to-head: top scorer(s) of this match
    const max = Math.max(...[...perPlayerPoints.values()], -1);
    if (max > 0) {
      for (const [name, pts] of perPlayerPoints) if (pts === max) base.get(name)!.matchWins++;
    }
  }

  // streaks (consecutive settled games scoring ≥1, counting from most recent)
  for (const [name, pts] of timeline) {
    const stat = base.get(name)!;
    let cur = 0, best = 0;
    for (const p of pts) { if (p > 0) { cur++; best = Math.max(best, cur); } else cur = 0; }
    stat.bestStreak = best;
    let trailing = 0;
    for (let i = pts.length - 1; i >= 0; i--) { if (pts[i] > 0) trailing++; else break; }
    stat.streak = trailing;
  }

  return [...base.values()].sort((a, b) => b.totalPoints - a.totalPoints);
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-soft p-3 text-center">
      <p className="text-xl md:text-2xl font-black tabular-nums">{value}</p>
      <p className="text-[0.65rem] md:text-xs text-white/45 uppercase tracking-wide mt-0.5">{label}</p>
      {sub && <p className="text-[0.6rem] text-white/35 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const load = () => fetch('/api/predictions').then(r => r.json()).then(setData).catch(() => {});
    load();
    const t = setInterval(load, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (!data) {
    return (
      <main className="min-h-screen p-8 flex flex-col items-center justify-center gap-3">
        <div className="live-dot" />
        <p className="text-white/60">Crunching the numbers…</p>
      </main>
    );
  }

  const stats = computeStats(data);
  const anySettled = stats.some(s => s.settled > 0);
  const sharpest = anySettled ? [...stats].sort((a, b) => (b.correct / (b.settled || 1)) - (a.correct / (a.settled || 1)))[0] : null;
  const mostExact = anySettled ? [...stats].sort((a, b) => b.exact - a.exact)[0] : null;
  const hottest = anySettled ? [...stats].sort((a, b) => b.streak - a.streak)[0] : null;

  // recent settled games, newest first
  const recent = data.fixtures
    .filter(f => data.results?.[f.id])
    .sort((a, b) => new Date(b.scheduledKickoff).getTime() - new Date(a.scheduledKickoff).getTime())
    .slice(0, 8);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <section className="mx-auto max-w-5xl space-y-8">

        <header className="glass rounded-3xl p-6 md:p-9 animate-rise">
          <a href="/" className="inline-flex items-center gap-1.5 text-flood text-sm font-medium hover:gap-2.5 transition-all">
            ← Back to Dashboard
          </a>
          <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-tight">Stats & History</h1>
          <p className="mt-2 text-white/50 text-sm">Accuracy, streaks and head-to-head across every settled match.</p>
        </header>

        {!anySettled ? (
          <div className="glass rounded-2xl p-10 text-center text-white/50">
            <div className="text-4xl mb-2">📊</div>
            No settled matches yet — stats appear once games have results.
          </div>
        ) : (
          <>
            {/* superlatives */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-rise" style={{ animationDelay: '40ms' }}>
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-xs text-white/45 uppercase tracking-wide">🎯 Sharpest</p>
                <p className="mt-1 text-lg font-bold">{sharpest?.name}</p>
                <p className="text-flood text-sm">{sharpest ? Math.round((sharpest.correct / (sharpest.settled || 1)) * 100) : 0}% correct outcomes</p>
              </div>
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-xs text-white/45 uppercase tracking-wide">🔮 Most exact scores</p>
                <p className="mt-1 text-lg font-bold">{mostExact?.name}</p>
                <p className="text-gold text-sm">{mostExact?.exact} spot-on</p>
              </div>
              <div className="glass rounded-2xl p-4 text-center">
                <p className="text-xs text-white/45 uppercase tracking-wide">🔥 Hottest streak</p>
                <p className="mt-1 text-lg font-bold">{hottest?.name}</p>
                <p className="text-grass text-sm">{hottest?.streak} in a row scoring</p>
              </div>
            </section>

            {/* per-player breakdown */}
            <section className="space-y-4 animate-rise" style={{ animationDelay: '90ms' }}>
              {stats.map((s, i) => (
                <div key={s.name} className="glass rounded-3xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}</span>
                      <div>
                        <h3 className="text-xl font-bold">{s.name}</h3>
                        <p className="text-xs text-white/40">{s.settled} settled · {s.gamePoints} pts from games</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-gold tabular-nums">{s.totalPoints}</p>
                      <p className="text-[0.65rem] text-white/40 uppercase tracking-wide">total</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    <Stat label="Accuracy" value={`${Math.round((s.correct / (s.settled || 1)) * 100)}%`} sub={`${s.correct}/${s.settled}`} />
                    <Stat label="Exact" value={s.exact} />
                    <Stat label="Match wins" value={s.matchWins} />
                    <Stat label="Possession" value={s.possession} />
                    <Stat label="Scorers" value={s.scorer} />
                    <Stat label="Streak" value={s.streak} sub={`best ${s.bestStreak}`} />
                  </div>
                </div>
              ))}
            </section>

            {/* recent results */}
            <section className="animate-rise" style={{ animationDelay: '140ms' }}>
              <h2 className="text-white/50 uppercase tracking-widest text-xs font-semibold mb-3 px-1">Recent results</h2>
              <div className="space-y-2">
                {recent.map(f => {
                  const r = data.results![f.id];
                  return (
                    <a key={f.id} href={`/matches/${f.id}`} className="glass-soft p-3 flex items-center justify-between hover:bg-white/8 transition-colors">
                      <span className="flex items-center gap-2 text-sm">
                        <span>{flag(f.homeTeam.name)}</span>
                        <span className="font-medium">{f.homeTeam.name}</span>
                      </span>
                      <span className="font-black tabular-nums px-3">{r.homeScore90}–{r.awayScore90}</span>
                      <span className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{f.awayTeam.name}</span>
                        <span>{flag(f.awayTeam.name)}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <footer className="text-center text-white/25 text-xs pt-2 pb-6">ANJ Predictions · Stats</footer>
      </section>
    </main>
  );
}
