'use client';
import { useEffect, useRef, useState } from 'react';
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

// Stable colour per player so chart lines are always recognisable
const PLAYER_COLOR: Record<string, string> = {
  Anthony: '#a78bfa',
  Nicolas: '#34d399',
  Jean: '#fbbf24',
};
const FALLBACK_COLORS = ['#a78bfa', '#34d399', '#fbbf24', '#f87171'];

type RacePoint = { matchIdx: number; home: string; away: string; cumPts: number };

function buildRace(data: Data): Map<string, RacePoint[]> {
  const settled = data.fixtures
    .filter(f => data.results?.[f.id])
    .sort((a, b) => new Date(a.scheduledKickoff).getTime() - new Date(b.scheduledKickoff).getTime());

  const cumulative: Record<string, number> = {};
  for (const p of data.players) cumulative[p.name] = 0;

  const series = new Map<string, RacePoint[]>();
  for (const p of data.players) series.set(p.name, [{ matchIdx: 0, home: '', away: '', cumPts: 0 }]);

  settled.forEach((f, i) => {
    const result = data.results![f.id];
    const fx = {
      id: f.id, kickoff: new Date(f.scheduledKickoff),
      homeScore90: result.homeScore90, awayScore90: result.awayScore90,
      homePossession: result.homePossession, awayPossession: result.awayPossession,
      firstGoalscorerId: result.firstGoalscorer ?? null,
      homeScoreExtraTime: result.homeScoreExtraTime ?? null,
      awayScoreExtraTime: result.awayScoreExtraTime ?? null,
      homePenaltyScore: result.homePenaltyScore ?? null,
      awayPenaltyScore: result.awayPenaltyScore ?? null,
    };
    for (const pred of data.predictions) {
      if (pred.fixtureId !== f.id || !pred.submittedAt) continue;
      const name = pred.user.name;
      if (!(name in cumulative)) continue;
      const { totalPoints } = scorePrediction({
        homeScore: pred.predictedHomeScore90 ?? 0,
        awayScore: pred.predictedAwayScore90 ?? 0,
        possession: pred.possession as 'HOME' | 'AWAY' | 'EQUAL' | undefined,
        firstGoalscorerId: pred.firstGoalscorer ?? null,
        homeScoreExtraTime: pred.homeScoreExtraTime ?? null,
        awayScoreExtraTime: pred.awayScoreExtraTime ?? null,
        homePenaltyScore: pred.homePenaltyScore ?? null,
        awayPenaltyScore: pred.awayPenaltyScore ?? null,
      }, fx);
      cumulative[name] += totalPoints;
    }
    for (const p of data.players) {
      series.get(p.name)!.push({ matchIdx: i + 1, home: f.homeTeam.name, away: f.awayTeam.name, cumPts: cumulative[p.name] });
    }
  });

  // Shift every line up by each player's base points so the race reflects the
  // full leaderboard total (base + game points), ending exactly on their total.
  for (const p of data.players) {
    const base = p.totalPoints - (cumulative[p.name] ?? 0);
    for (const point of series.get(p.name)!) point.cumPts += base;
  }

  return series;
}

function RaceChart({ data }: { data: Data }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const series = buildRace(data);
  if ([...series.values()].every(pts => pts.length < 2)) return null;

  const W = 600, H = 220;
  const PAD = { top: 24, right: 16, bottom: 36, left: 32 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const totalMatches = Math.max(...[...series.values()].map(s => s.length - 1), 1);
  const maxPts = Math.max(...[...series.values()].flatMap(s => s.map(p => p.cumPts)), 1);

  const sx = (i: number) => PAD.left + (i / totalMatches) * cW;
  const sy = (v: number) => PAD.top + cH - (v / maxPts) * cH;

  const toD = (pts: RacePoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.matchIdx).toFixed(1)},${sy(p.cumPts).toFixed(1)}`).join(' ');

  const yTicks = [0, 0.5, 1].map(t => Math.round(maxPts * t));

  return (
    <div className="glass rounded-3xl p-5 animate-rise" style={{ animationDelay: '70ms' }}>
      <h2 className="font-bold text-base mb-1">Points Race</h2>
      <p className="text-xs text-white/40 mb-4">Cumulative total points per player across settled games</p>
      <div className="relative" onMouseLeave={() => setTooltip(null)}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
          {/* horizontal grid */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD.left} y1={sy(v)} x2={W - PAD.right} y2={sy(v)}
                stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray={v === 0 ? '0' : '4 4'} />
              <text x={PAD.left - 5} y={sy(v) + 4} textAnchor="end"
                fill="rgba(255,255,255,0.3)" fontSize={9}>{v}</text>
            </g>
          ))}

          {/* lines */}
          {[...series.entries()].map(([name, pts], pi) => {
            const color = PLAYER_COLOR[name] ?? FALLBACK_COLORS[pi % FALLBACK_COLORS.length];
            return (
              <g key={name}>
                <path d={toD(pts)} fill="none" stroke={color} strokeWidth={2.5}
                  strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                {pts.slice(1).map((p, i) => (
                  <circle key={i} cx={sx(p.matchIdx)} cy={sy(p.cumPts)} r={4}
                    fill={color} stroke="#080412" strokeWidth={1.5}
                    className="cursor-pointer"
                    onMouseEnter={e => {
                      const svg = svgRef.current;
                      if (!svg) return;
                      const rect = svg.getBoundingClientRect();
                      const cx2 = rect.left + (sx(p.matchIdx) / W) * rect.width;
                      const cy2 = rect.top + (sy(p.cumPts) / H) * rect.height;
                      setTooltip({ x: cx2 - rect.left, y: cy2 - rect.top - 36, label: `${name}: ${p.cumPts} pts\n${p.home} v ${p.away}` });
                    }}
                  />
                ))}
                {/* name label at last point */}
                {(() => {
                  const last = pts[pts.length - 1];
                  return (
                    <text x={sx(last.matchIdx) + 6} y={sy(last.cumPts) + 4}
                      fill={color} fontSize={10} fontWeight={700}>{name}</text>
                  );
                })()}
              </g>
            );
          })}

          {/* x-axis match labels */}
          {[...([...series.values()][0] ?? [])].slice(1).map((p, i) => (
            totalMatches <= 12 || i % Math.ceil(totalMatches / 8) === 0 ? (
              <text key={i} x={sx(p.matchIdx)} y={H - 4} textAnchor="middle"
                fill="rgba(255,255,255,0.25)" fontSize={8}>{p.matchIdx}</text>
            ) : null
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div className="absolute pointer-events-none bg-black/80 border border-white/15 rounded-xl px-3 py-2 text-xs text-white whitespace-pre z-10"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}>
            {tooltip.label}
          </div>
        )}
      </div>
    </div>
  );
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

function AccuracyBar({ label, value, count, color }: { label: string; value: number; count: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1 text-xs">
        <span className="text-white/55">{label}</span>
        <span className="text-white/50">{count} · <span className="font-bold text-white/80">{Math.round(value * 100)}%</span></span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-white/8">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color, transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </div>
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

            {/* points race chart */}
            <RaceChart data={data} />

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

            {/* accuracy breakdown */}
            <section className="animate-rise" style={{ animationDelay: '120ms' }}>
              <h2 className="text-white/50 uppercase tracking-widest text-xs font-semibold mb-3 px-1">Accuracy Breakdown</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {stats.map(s => {
                  const color = PLAYER_COLOR[s.name] ?? FALLBACK_COLORS[0];
                  return (
                    <div key={s.name} className="glass rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <h3 className="font-bold text-sm">{s.name}</h3>
                        <span className="ml-auto text-xs text-white/40">{s.settled} games</span>
                      </div>
                      <div className="space-y-3">
                        <AccuracyBar
                          label="Outcome"
                          value={s.settled > 0 ? s.correct / s.settled : 0}
                          count={`${s.correct}/${s.settled}`}
                          color="#a78bfa"
                        />
                        <AccuracyBar
                          label="Exact Score"
                          value={s.settled > 0 ? s.exact / s.settled : 0}
                          count={`${s.exact}/${s.settled}`}
                          color="#fbbf24"
                        />
                        <AccuracyBar
                          label="Possession"
                          value={s.settled > 0 ? s.possession / s.settled : 0}
                          count={`${s.possession}/${s.settled}`}
                          color="#34d399"
                        />
                        <AccuracyBar
                          label="First Scorer"
                          value={s.settled > 0 ? s.scorer / s.settled : 0}
                          count={`${s.scorer}/${s.settled}`}
                          color="#f87171"
                        />
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/8 flex justify-between text-xs">
                        <span className="text-white/40">Avg per match</span>
                        <span className="font-bold">{s.settled > 0 ? (s.gamePoints / s.settled).toFixed(1) : '—'} pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* recent results */}
            <section className="animate-rise" style={{ animationDelay: '160ms' }}>
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
