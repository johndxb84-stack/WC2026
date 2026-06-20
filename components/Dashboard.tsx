'use client';
import { useEffect, useRef, useState } from 'react';
import { currentEligiblePlayer, dateKeyInTimezone, fixtureOrder, scorePrediction, shouldReveal } from '@/lib/domain';
import { flag } from '@/lib/flags';
import { useIdentity, PLAYERS, type PlayerName } from '@/lib/useIdentity';
import { useNotifications } from '@/lib/useNotifications';
import { fireConfetti } from '@/lib/confetti';
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
  possession?: string | null;
  firstGoalscorer?: string | null;
  homeScoreExtraTime?: number | null;
  awayScoreExtraTime?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
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

function pointsForPrediction(pred: ApiPrediction, result: StoredResult): number {
  return scorePrediction(
    {
      homeScore: pred.predictedHomeScore90 ?? 0,
      awayScore: pred.predictedAwayScore90 ?? 0,
      possession: (pred.possession as 'HOME' | 'AWAY' | 'EQUAL' | undefined) ?? undefined,
      firstGoalscorerId: pred.firstGoalscorer ?? null,
      homeScoreExtraTime: pred.homeScoreExtraTime ?? null,
      awayScoreExtraTime: pred.awayScoreExtraTime ?? null,
      homePenaltyScore: pred.homePenaltyScore ?? null,
      awayPenaltyScore: pred.awayPenaltyScore ?? null,
    },
    {
      id: pred.fixtureId,
      kickoff: new Date(0),
      homeScore90: result.homeScore90,
      awayScore90: result.awayScore90,
      homePossession: result.homePossession,
      awayPossession: result.awayPossession,
      firstGoalscorerId: result.firstGoalscorer ?? null,
      homeScoreExtraTime: result.homeScoreExtraTime ?? null,
      awayScoreExtraTime: result.awayScoreExtraTime ?? null,
      homePenaltyScore: result.homePenaltyScore ?? null,
      awayPenaltyScore: result.awayPenaltyScore ?? null,
    },
  ).totalPoints;
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

function countdownHMS(kickoff: Date, now: Date) {
  const diff = kickoff.getTime() - now.getTime();
  if (diff <= 0) return null;
  return {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  };
}

function TimeCell({ v, label }: { v: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="tabular-nums text-xl md:text-2xl font-black bg-flood/15 border border-flood/30 rounded-xl px-2 md:px-2.5 py-1.5 min-w-[2.3rem] text-center">
        {String(v).padStart(2, '0')}
      </span>
      <span className="text-[0.5rem] md:text-[0.55rem] uppercase tracking-wide text-white/40 mt-1">{label}</span>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncAge, setSyncAge] = useState(0);
  const [showPast, setShowPast] = useState(true);
  const [, setTick] = useState(0); // 1Hz re-render to drive the live countdown
  const { me, ready: idReady, choose, clear } = useIdentity();
  const { status: notifStatus, loading: notifLoading, subscribe: notifSubscribe, unsubscribe: notifUnsubscribe } = useNotifications(me);
  const [toast, setToast] = useState<string | null>(null);
  // Fixtures we've already celebrated for the current identity, so confetti
  // fires once per newly-settled win — never on historical results.
  const celebratedRef = useRef<{ forMe: PlayerName; seen: Set<string> } | null>(null);

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
      setTick(n => n + 1);
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

  // Celebrate when a freshly-settled match lands points for *you*. On the first
  // pass for a given identity we "prime" the seen-set (so historical results
  // don't all pop at once); afterwards only genuinely new wins fire confetti.
  useEffect(() => {
    if (!data || !me) return;
    const storeKey = `anj:celebrated:${me}`;
    let cache = celebratedRef.current;
    const priming = cache === null || cache.forMe !== me;
    if (priming) {
      let seen: Set<string>;
      try {
        const raw = localStorage.getItem(storeKey);
        seen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        seen = new Set<string>();
      }
      cache = { forMe: me, seen };
    }
    const seen = cache!.seen;

    let best: { pts: number; text: string } | null = null;
    for (const f of data.fixtures) {
      const result = data.results?.[f.id];
      if (!result) continue;
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const myPred = data.predictions.find(p => p.fixtureId === f.id && p.user.name === me && p.submittedAt);
      if (!myPred) continue;
      const pts = pointsForPrediction(myPred, result);
      if (pts > 0 && (!best || pts > best.pts)) {
        best = { pts, text: `+${pts} pts! ${f.homeTeam.name} ${result.homeScore90}–${result.awayScore90} ${f.awayTeam.name}` };
      }
    }
    celebratedRef.current = cache!;
    try { localStorage.setItem(storeKey, JSON.stringify([...seen])); } catch { /* ignore */ }
    if (!priming && best) {
      fireConfetti();
      setToast(best.text);
    }
  }, [data, me]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  if (error && !data) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-rose">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
        <section className="mx-auto max-w-5xl space-y-8">
          <div className="skeleton h-40 rounded-3xl" />
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <div className="skeleton h-36 rounded-2xl" />
            <div className="skeleton h-36 rounded-2xl" />
            <div className="skeleton h-36 rounded-2xl" />
          </div>
          <div className="grid md:grid-cols-2 gap-4 md:gap-5">
            <div className="skeleton h-64 rounded-3xl" />
            <div className="skeleton h-64 rounded-3xl" />
          </div>
          <p className="text-center text-white/40 text-sm">Loading the arena…</p>
        </section>
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

  // The very next match that hasn't kicked off yet — drives the hero countdown.
  const nextFixture = upcomingFixtures.find(f => new Date(f.scheduledKickoff).getTime() > now.getTime());

  // Matches where it's *your* turn to bet (open, not yet kicked off, you're up next).
  const myTurnFixtures = me
    ? upcomingFixtures.filter(f => {
        const kickoff = new Date(f.scheduledKickoff);
        if (now >= kickoff) return false;
        const preds = toDomainPreds(data.predictions, f.id);
        return currentEligiblePlayer(fixtureOrder(kickoff, f.venue, f.homeTeam.name, f.awayTeam.name), preds) === me;
      })
    : [];

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <section className="mx-auto max-w-5xl space-y-8">

        {/* ---------- Hero ---------- */}
        <header id="you" className="glass rounded-3xl p-6 md:p-9 animate-rise scroll-mt-4">
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

          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-white/50">
              Each match shows its own betting order — bet in turn, top to bottom.
            </p>
            {idReady && me && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {notifStatus === 'default' && (
                  <button
                    onClick={notifSubscribe}
                    disabled={notifLoading}
                    className="pill bg-white/8 text-white/70 border border-white/12 hover:bg-white/15 transition-colors shrink-0"
                    title="Enable push notifications"
                  >
                    {notifLoading ? '…' : '🔔 Notify me'}
                  </button>
                )}
                {notifStatus === 'subscribed' && (
                  <button
                    onClick={notifUnsubscribe}
                    disabled={notifLoading}
                    className="pill bg-grass/10 text-grass border border-grass/20 hover:bg-grass/20 transition-colors shrink-0"
                  >
                    🔔 Notifs on
                  </button>
                )}
                <button
                  onClick={clear}
                  className="pill bg-flood/15 text-white border border-flood/30 hover:bg-flood/25 transition-colors shrink-0"
                  title="Switch player"
                >
                  👤 {me} · switch
                </button>
              </div>
            )}
          </div>
          {error && <p className="mt-3 text-gold text-sm">{error}</p>}
        </header>

        {/* ---------- Next kickoff countdown ---------- */}
        {nextFixture && (() => {
          const k = new Date(nextFixture.scheduledKickoff);
          const c = countdownHMS(k, now);
          if (!c) return null;
          return (
            <section className="glass rounded-3xl p-5 md:p-6 animate-rise lift" style={{ animationDelay: '30ms' }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[0.7rem] uppercase tracking-[.25em] text-flood font-semibold">Next kickoff</p>
                  <div className="mt-1.5 flex items-center gap-2 text-base md:text-lg font-bold">
                    <span>{flag(nextFixture.homeTeam.name)}</span>
                    <span className="truncate">{nextFixture.homeTeam.name} <span className="text-white/40">v</span> {nextFixture.awayTeam.name}</span>
                    <span>{flag(nextFixture.awayTeam.name)}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/45">
                    {formatKickoff(k, todayKey, tomorrowKey)}{nextFixture.venue ? ` · ${nextFixture.venue}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.d > 0 && <TimeCell v={c.d} label="days" />}
                  <TimeCell v={c.h} label="hrs" />
                  <TimeCell v={c.m} label="min" />
                  <TimeCell v={c.s} label="sec" />
                </div>
              </div>
            </section>
          );
        })()}

        {/* ---------- Identity picker (first visit / after switch) ---------- */}
        {idReady && !me && (
          <section className="glass rounded-3xl p-6 animate-rise text-center">
            <h2 className="text-lg font-bold">Who are you?</h2>
            <p className="text-sm text-white/50 mt-1 mb-4">
              We'll remember on this phone, pre-fill your bets and tell you when it's your turn.
            </p>
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              {PLAYERS.map(name => (
                <button
                  key={name}
                  onClick={() => choose(name)}
                  className="rounded-2xl py-4 font-bold bg-white/8 hover:bg-flood/20 border border-white/12 hover:border-flood/40 transition-all"
                >
                  {name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Your turn banner ---------- */}
        {me && myTurnFixtures.length > 0 && (
          <section className="rounded-3xl p-5 md:p-6 animate-rise border border-flood/40 bg-flood/12">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔔</span>
              <h2 className="font-bold text-base md:text-lg">
                It's your turn — {myTurnFixtures.length} match{myTurnFixtures.length > 1 ? 'es' : ''} waiting
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {myTurnFixtures.slice(0, 6).map(f => (
                <a
                  key={f.id}
                  href={`/matches/${f.id}`}
                  className="glass-soft p-3 flex items-center justify-between gap-2 hover:bg-white/10 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium truncate">
                    <span>{flag(f.homeTeam.name)}</span>
                    <span className="truncate">{f.homeTeam.name} v {f.awayTeam.name}</span>
                    <span>{flag(f.awayTeam.name)}</span>
                  </span>
                  <span className="pill bg-flood/25 text-white border border-flood/40 shrink-0">Bet →</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Leaderboard ---------- */}
        <section className="animate-rise" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-white/50 uppercase tracking-widest text-xs font-semibold">Leaderboard</h2>
            <span className="text-white/30 text-xs">{sortedPlayers.length} players</span>
          </div>
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            {sortedPlayers.map((p, i) => {
              const isLeader = i === 0 && p.totalPoints > 0;
              const isMe = p.name === me;
              const behind = leaderPts - p.totalPoints;
              return (
                <div
                  key={p.name}
                  className={`relative glass lift rounded-2xl p-4 md:p-5 text-center overflow-hidden ${
                    isMe ? 'ring-2 ring-flood/60' : isLeader ? 'ring-1 ring-gold/40 leader-glow' : ''
                  }`}
                >
                  {isLeader && (
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
                  )}
                  {isMe && (
                    <span className="absolute top-2 right-2 pill bg-flood/25 text-white border border-flood/40 text-[0.55rem] px-2 py-0.5">You</span>
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
          className="glass lift rounded-2xl p-4 md:p-5 flex items-center justify-between hover:bg-white/8 transition-colors animate-rise"
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
                const betOrder = fixtureOrder(kickoff, f.venue, f.homeTeam.name, f.awayTeam.name);
                const preds = toDomainPreds(data.predictions, f.id);
                const current = currentEligiblePlayer(betOrder, preds);
                const reveal = shouldReveal(betOrder, preds, { id: f.id, kickoff }, now);
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
                  <article key={f.id} className="glass lift rounded-3xl p-5 flex flex-col gap-4">
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
                        {betOrder.map(name => {
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
                    <article key={f.id} className="glass lift rounded-3xl p-5 flex flex-col gap-4 opacity-90">
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

      {/* ---------- Celebration toast ---------- */}
      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 pointer-events-none">
          <div className="glass rounded-2xl px-5 py-3 border border-gold/40 bg-gold/12 text-center animate-rise shadow-2xl">
            <p className="text-2xl">🎉</p>
            <p className="font-bold text-gold mt-0.5">{toast}</p>
          </div>
        </div>
      )}
    </main>
  );
}
