'use client';
import { useEffect, useState } from 'react';
import { currentEligiblePlayer, dateKeyInTimezone, orderForVenueDate, shouldReveal } from '@/lib/domain';
import { flag } from '@/lib/flags';
import type { StoredResult } from '@/lib/results-store';
import type { LiveSnapshot } from '@/lib/live-store';

const TIMEZONE = 'Asia/Dubai';
const POLL_MS = 10_000;

const MEDAL = ['🥇', '🥈', '🥉'];

function SourceBadge({ source }: { source?: 'manual' | 'auto' }) {
  return source === 'auto'
    ? <span className="pill bg-flood/12 text-flood border border-flood/20">⚡ Auto</span>
    : <span className="pill bg-white/8 text-white/55 border border-white/12">✍️ Manual</span>;
}

type TeamInfo = { name: string; shortName: string | null; logoUrl: string | null };
type ApiFixture = {
  id: string;
  scheduledKickoff: string;
  venue: string | null;
  status: string;
  playerOrder: string[] | null;
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
type DashboardData = { fixtures: ApiFixture[]; predictions: ApiPrediction[]; players: ApiPlayer[]; results?: Record<string, StoredResult>; live?: Record<string, LiveSnapshot> };

const LIVE_LABEL: Record<string, string> = { HT: 'Half-time', P: 'Penalties', BT: 'Break', ET: 'Extra time' };
function liveLabel(s: LiveSnapshot) {
  if (LIVE_LABEL[s.status]) return LIVE_LABEL[s.status];
  return s.elapsed != null ? `${s.elapsed}'` : 'Live';
}

function computeQuickStats(data: DashboardData) {
  const stats: Record<string, { settled: number; correct: number }> = {};
  for (const pred of data.predictions) {
    if (!pred.submittedAt) continue;
    const result = data.results?.[pred.fixtureId];
    if (!result) continue;
    const name = pred.user.name;
    if (!stats[name]) stats[name] = { settled: 0, correct: 0 };
    stats[name].settled++;
    const po = (pred.predictedHomeScore90 ?? 0) > (pred.predictedAwayScore90 ?? 0) ? 'H' : (pred.predictedHomeScore90 ?? 0) < (pred.predictedAwayScore90 ?? 0) ? 'A' : 'D';
    const ro = result.homeScore90 > result.awayScore90 ? 'H' : result.homeScore90 < result.awayScore90 ? 'A' : 'D';
    if (po === ro) stats[name].correct++;
  }
  return stats;
}

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

function formatKickoff(kickoff: Date, todayKey: string, tomorrowKey: string) {
  const key = dateKeyInTimezone(kickoff, TIMEZONE);
  const time = kickoff.toLocaleTimeString('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
  const day = key === todayKey ? 'Today' : key === tomorrowKey ? 'Tomorrow' : kickoff.toLocaleDateString('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

function countdown(kickoff: Date, now: Date) {
  const diff = kickoff.getTime() - now.getTime();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncAge, setSyncAge] = useState(0);
  const [showPast, setShowPast] = useState(true);

  const load = () =>
    fetch('/api/predictions')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<DashboardData>;
      })
      .then(d => { setData(d); setError(null); setLastSynced(new Date()); })
      .catch(() => setError('Connection lost — retrying…'));

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (lastSynced) setSyncAge(Math.floor((Date.now() - lastSynced.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastSynced]);

  // Nudge the server to pull fresh results from the football API while anyone
  // is viewing. The endpoint self-throttles, so extra viewers cost nothing.
  useEffect(() => {
    const sync = () =>
      fetch('/api/sync-results', { method: 'POST' })
        .then(r => r.json())
        .then(j => { if (j?.written > 0) load(); })
        .catch(() => {});
    sync();
    const timer = setInterval(sync, 60_000);
    return () => clearInterval(timer);
  }, []);

  if (error && !data) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-rose">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen p-8 flex flex-col items-center justify-center gap-3">
        <div className="live-dot" />
        <p className="text-white/60">Loading the arena…</p>
      </main>
    );
  }

  const now = new Date();
  const todayKey = dateKeyInTimezone(now, TIMEZONE);
  const tomorrowKey = dateKeyInTimezone(new Date(now.getTime() + 24 * 60 * 60 * 1000), TIMEZONE);
  const sortedPlayers = [...data.players].sort((a, b) => b.totalPoints - a.totalPoints);
  const leaderPts = sortedPlayers[0]?.totalPoints ?? 0;
  const quickStats = computeQuickStats(data);

  // All unsettled fixtures (no final result yet) sorted chronologically.
  // Includes today, tomorrow, and all future match days so users can bet ahead.
  const upcomingFixtures = data.fixtures.filter(f => {
    if (data.results?.[f.id]) return false; // settled → goes to Past Results
    const kickoff = new Date(f.scheduledKickoff);
    // Keep in upcoming if not yet kicked off, or live within last 3h
    return kickoff.getTime() > now.getTime() - 3 * 60 * 60 * 1000;
  }).sort((a, b) => new Date(a.scheduledKickoff).getTime() - new Date(b.scheduledKickoff).getTime());

  const betFixtureIds = new Set(data.predictions.filter(p => p.submittedAt).map(p => p.fixtureId));
  const pastFixtures = data.fixtures.filter(f => {
    // Show past games that are settled OR that we engaged with (bet placed)
    const kickoff = new Date(f.scheduledKickoff);
    if (kickoff.getTime() > now.getTime() - 3 * 60 * 60 * 1000) return false;
    return betFixtureIds.has(f.id) || Boolean(data.results?.[f.id]);
  }).sort((a, b) => new Date(b.scheduledKickoff).getTime() - new Date(a.scheduledKickoff).getTime());

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <section className="mx-auto max-w-5xl space-y-8">

        {/* ---------- Hero ---------- */}
        <header className="glass rounded-3xl p-6 md:p-9 animate-rise">
          <div className="flex items-center justify-between gap-3">
            <p className="text-flood uppercase tracking-[.3em] text-xs font-semibold">World Cup 2026</p>
            <div className="flex items-center gap-2">
              <a href="/stats" className="pill bg-white/8 text-white/80 border border-white/12 hover:bg-white/15 transition-colors">
                📊 Stats
              </a>
              <button
                onClick={() => load()}
                className="pill bg-grass/10 text-grass border border-grass/20 hover:bg-grass/20 transition-colors"
              >
                <span className="live-dot" />
                {syncAge < 5 ? 'Live' : `synced ${syncAge}s ago`}
              </button>
            </div>
          </div>

          <h1 className="mt-3 text-4xl md:text-6xl font-black tracking-tight">
            Prediction Arena
          </h1>

          <p className="mt-3 text-sm text-white/50">
            Each match shows its own betting order — bet in turn, top to bottom.
          </p>
          {error && <p className="mt-3 text-gold text-sm">{error}</p>}
        </header>

        {/* ---------- Leaderboard ---------- */}
        <section className="animate-rise" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-white/50 uppercase tracking-widest text-xs font-semibold">Leaderboard</h2>
            <span className="text-white/30 text-xs">{sortedPlayers.length} players</span>
          </div>
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            {sortedPlayers.map((p, i) => {
              const isLeader = i === 0 && p.totalPoints > 0;
              const behind = leaderPts - p.totalPoints;
              return (
                <div
                  key={p.name}
                  className={`relative glass rounded-2xl p-4 md:p-5 text-center overflow-hidden ${
                    isLeader ? 'ring-1 ring-gold/40' : ''
                  }`}
                >
                  {isLeader && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
                  )}
                  <div className="text-2xl md:text-3xl">{MEDAL[i] ?? `#${i + 1}`}</div>
                  <h3 className="mt-1 text-base md:text-xl font-bold truncate">{p.name}</h3>
                  <p className={`mt-1 text-xl md:text-3xl font-black ${isLeader ? 'text-gold' : 'text-white'}`}>
                    {p.totalPoints}
                  </p>
                  <p className="text-[0.65rem] md:text-xs text-white/40 uppercase tracking-wide">pts</p>
                  {i > 0 && behind > 0 && (
                    <p className="mt-1 text-[0.65rem] md:text-xs text-white/35">−{behind} behind</p>
                  )}
                  <p className="mt-1.5 text-[0.65rem] text-white/40">
                    {(() => {
                      const s = quickStats[p.name];
                      if (!s || s.settled === 0) return '0 bets';
                      return `${s.settled} bets · ${Math.round(s.correct / s.settled * 100)}% accurate`;
                    })()}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------- Stats & History ---------- */}
        <a
          href="/stats"
          className="glass rounded-2xl p-4 md:p-5 flex items-center justify-between hover:bg-white/8 transition-colors animate-rise"
          style={{ animationDelay: '90ms' }}
        >
          <div>
            <h2 className="font-bold text-base md:text-lg">📊 Stats &amp; History</h2>
            <p className="text-sm text-white/50 mt-0.5">Accuracy, streaks and head-to-head breakdowns</p>
          </div>
          <span className="text-white/40 text-xl ml-4">→</span>
        </a>

        {/* ---------- Upcoming matches ---------- */}
        <section className="animate-rise" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-white/50 uppercase tracking-widest text-xs font-semibold">Upcoming Matches</h2>
            <span className="text-white/30 text-xs">{upcomingFixtures.length} to bet</span>
          </div>

          {upcomingFixtures.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-white/50">
              <div className="text-4xl mb-2">🏆</div>
              All matches settled. Tournament over!
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 md:gap-5">
              {upcomingFixtures.map(f => {
                const kickoff = new Date(f.scheduledKickoff);
                const fixtureOrder = orderForVenueDate(kickoff, f.venue);
                const preds = toDomainPreds(data.predictions, f.id);
                const current = currentEligiblePlayer(fixtureOrder, preds);
                const reveal = shouldReveal(fixtureOrder, preds, { id: f.id, kickoff }, now);
                const isLocked = now >= kickoff;
                const result = data.results?.[f.id];
                const live = !result ? data.live?.[f.id] : undefined;
                const cd = countdown(kickoff, now);
                const betCount = preds.length;

                let statusPill;
                if (result) {
                  statusPill = <span className="pill bg-gold/12 text-gold border border-gold/20">Result in</span>;
                } else if (live) {
                  statusPill = <span className="pill bg-rose/15 text-rose border border-rose/25"><span className="live-dot-red" />{liveLabel(live)}</span>;
                } else if (isLocked) {
                  statusPill = <span className="pill bg-rose/12 text-rose border border-rose/20">Closed</span>;
                } else {
                  statusPill = <span className="pill bg-grass/12 text-grass border border-grass/20"><span className="live-dot" />Open</span>;
                }

                return (
                  <article key={f.id} className="glass rounded-3xl p-5 flex flex-col gap-4">
                    {/* top row */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/40">{f.venue}</span>
                      <div className="flex items-center gap-1.5">
                        {result && <SourceBadge source={result.source} />}
                        {statusPill}
                      </div>
                    </div>

                    {/* teams */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 text-center">
                        <div className="text-4xl md:text-5xl leading-none">{flag(f.homeTeam.name)}</div>
                        <div className="mt-2 text-sm md:text-base font-bold leading-tight">{f.homeTeam.name}</div>
                      </div>
                      <div className="px-2 text-center">
                        {result ? (
                          <div className="text-2xl md:text-3xl font-black tabular-nums">
                            {result.homeScore90}<span className="text-white/30 mx-1">–</span>{result.awayScore90}
                          </div>
                        ) : live ? (
                          <div>
                            <div className="text-2xl md:text-3xl font-black tabular-nums text-rose">
                              {live.homeGoals}<span className="text-rose/40 mx-1">–</span>{live.awayGoals}
                            </div>
                            <div className="text-[0.6rem] text-rose/80 uppercase tracking-wide mt-0.5 flex items-center justify-center gap-1">
                              <span className="live-dot-red" />{liveLabel(live)}
                            </div>
                          </div>
                        ) : (
                          <div className="text-white/30 font-black text-lg">VS</div>
                        )}
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-4xl md:text-5xl leading-none">{flag(f.awayTeam.name)}</div>
                        <div className="mt-2 text-sm md:text-base font-bold leading-tight">{f.awayTeam.name}</div>
                      </div>
                    </div>

                    {/* kickoff */}
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <span className="text-white/60">{formatKickoff(kickoff, todayKey, tomorrowKey)}</span>
                      {cd && !isLocked && <span className="pill bg-flood/25 text-white border border-flood/40 font-semibold">{cd}</span>}
                    </div>

                    {/* betting progress */}
                    <div className="glass-soft p-3">
                      <div className="flex items-center justify-between gap-2">
                        {fixtureOrder.map(name => {
                          const hasBet = preds.some(p => p.userName === name);
                          const isCurrent = name === current && !isLocked;
                          return (
                            <div key={name} className="flex-1 flex flex-col items-center gap-1">
                              <span
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  hasBet ? 'bg-grass/20 text-grass' :
                                  isCurrent ? 'bg-flood/20 text-flood' :
                                  'bg-white/8 text-white/40'
                                }`}
                              >
                                {hasBet ? '✓' : isCurrent ? '⏳' : name[0]}
                              </span>
                              <span className={`text-[0.7rem] ${isCurrent ? 'text-flood font-semibold' : 'text-white/40'}`}>
                                {name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-center text-xs text-white/50">
                        {isLocked
                          ? `Betting closed · ${betCount}/3 placed`
                          : current
                            ? <>Waiting on <span className="text-flood font-semibold">{current}</span> · {betCount}/3 placed</>
                            : 'All bets in! 🎉'}
                      </p>
                    </div>

                    {/* revealed predictions (compact) */}
                    {reveal && preds.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2 text-xs">
                        {preds.map(p => (
                          <span key={p.userName} className="pill bg-white/6 text-white/70">
                            {p.userName} <span className="text-white/90 font-bold">{p.homeScore}–{p.awayScore}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* CTA */}
                    <a
                      href={`/matches/${f.id}`}
                      className={`btn ${isLocked ? 'btn-ghost' : 'btn-primary'} w-full py-3 text-sm`}
                    >
                      {isLocked ? 'View match & scoring' : current ? `Place ${current}'s bet →` : 'View predictions →'}
                    </a>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- Past Results ---------- */}
        <section className="animate-rise" style={{ animationDelay: '180ms' }}>
          <button
            onClick={() => setShowPast(v => !v)}
            className="w-full flex items-center justify-between mb-3 px-1 group"
          >
            <h2 className="text-white/50 uppercase tracking-widest text-xs font-semibold">Past Results</h2>
            <span className="flex items-center gap-2">
              <span className="text-white/30 text-xs">{pastFixtures.length} matches</span>
              <span className={`text-white/30 text-xs transition-transform duration-200 ${showPast ? 'rotate-180' : ''}`}>▲</span>
            </span>
          </button>

          {showPast && (
            pastFixtures.length === 0 ? (
              <div className="glass rounded-2xl p-6 text-center text-white/40 text-sm">
                No completed matches yet — results will appear here once games are settled.
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4 md:gap-5">
                {pastFixtures.map(f => {
                  const kickoff = new Date(f.scheduledKickoff);
                  const preds = toDomainPreds(data.predictions, f.id);
                  const result = data.results?.[f.id];

                  return (
                    <article key={f.id} className="glass rounded-3xl p-5 flex flex-col gap-4 opacity-90">
                      {/* top row */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">{formatKickoff(kickoff, todayKey, tomorrowKey)}</span>
                        <div className="flex items-center gap-1.5">
                          {result && <SourceBadge source={result.source} />}
                          {result
                            ? <span className="pill bg-gold/12 text-gold border border-gold/20">Final</span>
                            : <span className="pill bg-white/8 text-white/50">No result yet</span>
                          }
                        </div>
                      </div>

                      {/* teams + score */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 text-center">
                          <div className="text-4xl md:text-5xl leading-none">{flag(f.homeTeam.name)}</div>
                          <div className="mt-2 text-sm md:text-base font-bold leading-tight">{f.homeTeam.name}</div>
                        </div>
                        <div className="px-2 text-center">
                          {result ? (
                            <div className="text-2xl md:text-3xl font-black tabular-nums">
                              {result.homeScore90}<span className="text-white/30 mx-1">–</span>{result.awayScore90}
                            </div>
                          ) : (
                            <div className="text-white/30 font-black text-lg">–</div>
                          )}
                        </div>
                        <div className="flex-1 text-center">
                          <div className="text-4xl md:text-5xl leading-none">{flag(f.awayTeam.name)}</div>
                          <div className="mt-2 text-sm md:text-base font-bold leading-tight">{f.awayTeam.name}</div>
                        </div>
                      </div>

                      {/* predictions (always revealed for completed matches) */}
                      {preds.length > 0 ? (
                        <div className="glass-soft p-3">
                          <p className="text-xs text-white/40 text-center mb-2 uppercase tracking-wide">Predictions</p>
                          <div className="flex flex-wrap justify-center gap-2">
                            {preds.map(p => (
                              <span key={p.userName} className="pill bg-white/6 text-white/70">
                                {p.userName} <span className="text-white/90 font-bold">{p.homeScore}–{p.awayScore}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-center text-xs text-white/30">No predictions placed</p>
                      )}

                      <a
                        href={`/matches/${f.id}`}
                        className="btn btn-ghost w-full py-3 text-sm"
                      >
                        View scoring breakdown →
                      </a>
                    </article>
                  );
                })}
              </div>
            )
          )}
        </section>

        <footer className="text-center text-white/25 text-xs pt-2 pb-6">
          Auto-syncs across all devices · ANJ Predictions
        </footer>
      </section>
    </main>
  );
}
