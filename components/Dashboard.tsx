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
const PLAYER_COLORS: Record<string, string> = {
  Anthony: '#a78bfa',
  Nicolas: '#34d399',
  Jean: '#fbbf24',
};

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
  stage: string | null;
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

function parsePhase(stage: string | null | undefined): string {
  if (!stage) return 'Other';
  if (stage.startsWith('Group')) return 'Group Stage';
  return stage;
}

function pointsForPrediction(pred: ApiPrediction, result: StoredResult, kickoff: Date): number {
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
      kickoff,
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

/** Points earned by each player on a single settled fixture (name → pts). */
function kickoffOf(data: DashboardData, fixtureId: string): Date {
  const fx = data.fixtures.find(f => f.id === fixtureId);
  return fx ? new Date(fx.scheduledKickoff) : new Date(0);
}

function predPointsMap(data: DashboardData, fixtureId: string): Record<string, number> {
  const result = data.results?.[fixtureId];
  if (!result) return {};
  const kickoff = kickoffOf(data, fixtureId);
  const map: Record<string, number> = {};
  for (const pred of data.predictions) {
    if (pred.fixtureId !== fixtureId || !pred.submittedAt) continue;
    map[pred.user.name] = pointsForPrediction(pred, result, kickoff);
  }
  return map;
}

function computeQuickStats(data: DashboardData) {
  const stats: Record<string, { settled: number; correct: number; streak: number }> = {};
  const timeline: Record<string, { kickoff: Date; pts: number }[]> = {};

  for (const pred of data.predictions) {
    if (!pred.submittedAt) continue;
    const result = data.results?.[pred.fixtureId];
    if (!result) continue;
    const name = pred.user.name;
    if (!stats[name]) { stats[name] = { settled: 0, correct: 0, streak: 0 }; timeline[name] = []; }
    stats[name].settled++;
    const po = (pred.predictedHomeScore90 ?? 0) > (pred.predictedAwayScore90 ?? 0) ? 'H' : (pred.predictedHomeScore90 ?? 0) < (pred.predictedAwayScore90 ?? 0) ? 'A' : 'D';
    const ro = result.homeScore90 > result.awayScore90 ? 'H' : result.homeScore90 < result.awayScore90 ? 'A' : 'D';
    if (po === ro) stats[name].correct++;
    const fixture = data.fixtures.find(f => f.id === pred.fixtureId);
    const kickoff = fixture ? new Date(fixture.scheduledKickoff) : new Date(0);
    const pts = pointsForPrediction(pred, result, kickoff);
    timeline[name].push({ kickoff, pts });
  }

  for (const name of Object.keys(stats)) {
    const ordered = (timeline[name] ?? []).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
    let streak = 0;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].pts > 0) streak++;
      else break;
    }
    stats[name].streak = streak;
  }

  return stats;
}

function computeRoundPoints(data: DashboardData) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const roundIds = new Set(
    data.fixtures
      .filter(f => data.results?.[f.id] && new Date(f.scheduledKickoff) >= sevenDaysAgo)
      .map(f => f.id)
  );
  const pts: Record<string, number> = {};
  for (const pred of data.predictions) {
    if (!pred.submittedAt || !roundIds.has(pred.fixtureId)) continue;
    const result = data.results?.[pred.fixtureId];
    if (!result) continue;
    pts[pred.user.name] = (pts[pred.user.name] ?? 0) + pointsForPrediction(pred, result, kickoffOf(data, pred.fixtureId));
  }
  return pts;
}

function computePlayerProfile(data: DashboardData, playerName: string) {
  const results = data.results ?? {};
  let settled = 0, gamePoints = 0, correct = 0, exact = 0, possession = 0, scorer = 0, streak = 0;
  let bestMatch: { home: string; away: string; pts: number } | null = null;
  const timeline: number[] = [];

  const settledFixtures = data.fixtures
    .filter(f => results[f.id])
    .sort((a, b) => new Date(a.scheduledKickoff).getTime() - new Date(b.scheduledKickoff).getTime());

  for (const f of settledFixtures) {
    const result = results[f.id];
    const pred = data.predictions.find(p => p.fixtureId === f.id && p.user.name === playerName && p.submittedAt);
    if (!pred || !result) continue;
    const s = scorePrediction(
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
        id: f.id, kickoff: new Date(f.scheduledKickoff),
        homeScore90: result.homeScore90, awayScore90: result.awayScore90,
        homePossession: result.homePossession, awayPossession: result.awayPossession,
        firstGoalscorerId: result.firstGoalscorer ?? null,
        homeScoreExtraTime: result.homeScoreExtraTime ?? null,
        awayScoreExtraTime: result.awayScoreExtraTime ?? null,
        homePenaltyScore: result.homePenaltyScore ?? null,
        awayPenaltyScore: result.awayPenaltyScore ?? null,
      },
    );
    settled++;
    gamePoints += s.totalPoints;
    if (s.outcomePoints > 0) correct++;
    if (s.exactScorePoints > 0) exact++;
    if (s.possessionPoints > 0) possession++;
    if (s.firstGoalscorerPoints > 0) scorer++;
    timeline.push(s.totalPoints);
    if (!bestMatch || s.totalPoints > bestMatch.pts) {
      bestMatch = { home: f.homeTeam.name, away: f.awayTeam.name, pts: s.totalPoints };
    }
  }
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i] > 0) streak++;
    else break;
  }
  const player = data.players.find(p => p.name === playerName);
  return { settled, gamePoints, totalPoints: player?.totalPoints ?? 0, correct, exact, possession, scorer, streak, bestMatch };
}

function toDomainPreds(predictions: ApiPrediction[], fixtureId: string) {
  return predictions
    .filter(p => p.fixtureId === fixtureId && p.status !== 'WAITING' && p.submittedAt)
    .map(p => ({
      userName: p.user.name,
      homeScore: p.predictedHomeScore90 ?? 0,
      awayScore: p.predictedAwayScore90 ?? 0,
      homeScoreExtraTime: p.homeScoreExtraTime ?? null,
      awayScoreExtraTime: p.awayScoreExtraTime ?? null,
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

const PLAYER_FALLBACK = '#f0ecff';
function playerColor(name: string) {
  return PLAYER_COLORS[name] ?? PLAYER_FALLBACK;
}

function PredPill({ name, home, away, homeET, awayET, pts }: { name: string; home: number; away: number; homeET?: number | null; awayET?: number | null; pts?: number | null }) {
  const color = playerColor(name);
  const hasET = homeET != null && awayET != null;
  const showHome = hasET ? homeET : home;
  const showAway = hasET ? awayET : away;
  return (
    <span
      className="pill border"
      style={{ backgroundColor: `${color}1f`, borderColor: `${color}59`, color: '#f0ecff' }}
    >
      <span className="font-semibold" style={{ color }}>{name}</span>
      <span className="font-bold ml-0.5">{showHome}–{showAway}</span>
      {hasET && <span className="ml-0.5 text-[0.6rem] uppercase tracking-wide text-white/45">aet</span>}
      {pts != null && pts > 0 && (
        <span className="ml-1 font-bold text-gold">+{pts}</span>
      )}
    </span>
  );
}

function ProfileBar({ label, value, count, color }: { label: string; value: number; count: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1 text-xs">
        <span className="text-white/55">{label}</span>
        <span className="text-white/55">{count} · <span className="font-bold text-white/80">{Math.round(value * 100)}%</span></span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-white/8">
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [syncAge, setSyncAge] = useState(0);
  const [, setTick] = useState(0);
  const { me, ready: idReady, choose, clear } = useIdentity();
  const { status: notifStatus, loading: notifLoading, subscribe: notifSubscribe, unsubscribe: notifUnsubscribe } = useNotifications(me);
  const [toast, setToast] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null);
  const [profilePlayer, setProfilePlayer] = useState<string | null>(null);
  const celebratedRef = useRef<{ forMe: PlayerName; seen: Set<string> } | null>(null);

  const [deckIndex, setDeckIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

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
      const pts = pointsForPrediction(myPred, result, new Date(f.scheduledKickoff));
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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent, maxIndex: number) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) setDeckIndex(i => Math.min(i + 1, maxIndex));
    else setDeckIndex(i => Math.max(i - 1, 0));
  };

  if (error && !data) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <p className="text-rose">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="min-h-screen px-4 py-6 has-bottom-nav">
        <div className="space-y-4 mt-2">
          <div className="skeleton h-10 rounded-2xl" />
          <div className="skeleton h-[60vh] rounded-3xl" />
          <div className="flex gap-2">
            <div className="skeleton h-2 flex-1 rounded-full" />
            <div className="skeleton h-2 flex-1 rounded-full" />
            <div className="skeleton h-2 flex-1 rounded-full" />
          </div>
        </div>
        <p className="text-center text-white/40 text-sm mt-6">Loading the arena…</p>
      </main>
    );
  }

  const now = new Date();
  const todayKey = dateKeyInTimezone(now, TIMEZONE);
  const tomorrowKey = dateKeyInTimezone(new Date(now.getTime() + 24 * 60 * 60 * 1000), TIMEZONE);
  const sortedPlayers = [...data.players].sort((a, b) => b.totalPoints - a.totalPoints);
  const leaderPts = sortedPlayers[0]?.totalPoints ?? 0;
  const quickStats = computeQuickStats(data);
  const roundPts = computeRoundPoints(data);

  const upcomingFixtures = data.fixtures.filter(f => {
    if (data.results?.[f.id]) return false;
    const kickoff = new Date(f.scheduledKickoff);
    return kickoff.getTime() > now.getTime() - 3 * 60 * 60 * 1000;
  }).sort((a, b) => new Date(a.scheduledKickoff).getTime() - new Date(b.scheduledKickoff).getTime());

  const betFixtureIds = new Set(data.predictions.filter(p => p.submittedAt).map(p => p.fixtureId));
  const pastFixtures = data.fixtures.filter(f => {
    const kickoff = new Date(f.scheduledKickoff);
    if (kickoff.getTime() > now.getTime() - 3 * 60 * 60 * 1000) return false;
    return betFixtureIds.has(f.id) || Boolean(data.results?.[f.id]);
  }).sort((a, b) => new Date(b.scheduledKickoff).getTime() - new Date(a.scheduledKickoff).getTime());

  const nextFixture = upcomingFixtures.find(f => new Date(f.scheduledKickoff).getTime() > now.getTime());

  const myTurnFixtures = me
    ? upcomingFixtures.filter(f => {
        const kickoff = new Date(f.scheduledKickoff);
        if (now >= kickoff) return false;
        const preds = toDomainPreds(data.predictions, f.id);
        return currentEligiblePlayer(fixtureOrder(kickoff, f.venue, f.homeTeam.name, f.awayTeam.name), preds) === me;
      })
    : [];

  const upcomingPhases = [...new Set(upcomingFixtures.map(f => parsePhase(f.stage)))];
  const filteredUpcoming = phaseFilter ? upcomingFixtures.filter(f => parsePhase(f.stage) === phaseFilter) : upcomingFixtures;
  const filteredPast = phaseFilter ? pastFixtures.filter(f => parsePhase(f.stage) === phaseFilter) : pastFixtures;

  const clampedDeckIndex = Math.min(deckIndex, Math.max(0, filteredUpcoming.length - 1));

  return (
    <main className="min-h-screen">

      {/* ── Compact sticky header ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 px-4 h-12 border-b border-white/8"
        style={{ background: 'linear-gradient(180deg, rgba(8,4,18,0.88), rgba(13,8,32,0.80))', backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)' }}>
        <span className="font-black text-sm tracking-tight select-none">
          ⚽ <span className="text-flood">ANJ</span> <span className="text-white/70">Predictions</span>
        </span>
        <div className="flex items-center gap-1.5">
          {idReady && me ? (
            <button onClick={clear} className="pill bg-flood/15 text-white border border-flood/30 hover:bg-flood/25 transition-colors text-xs">
              👤 {me}
            </button>
          ) : idReady && !me ? (
            <span className="text-white/40 text-xs">Pick player ↓</span>
          ) : null}
          <button
            onClick={() => load()}
            className="pill bg-grass/10 text-grass border border-grass/20 hover:bg-grass/20 transition-colors text-xs"
          >
            <span className="live-dot" />
            {syncAge < 5 ? 'Live' : `${syncAge}s`}
          </button>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-4 mt-3 px-4 py-2 rounded-xl bg-gold/12 border border-gold/30 text-gold text-xs text-center">
          {error}
        </div>
      )}

      {/* ── Compact leaderboard strip ── always visible at top */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-white/40 uppercase tracking-widest text-[0.6rem] font-semibold">Standings</span>
          <span className="text-white/25 text-[0.6rem]">tap for stats</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {sortedPlayers.map((p, i) => {
            const isLeader = i === 0 && p.totalPoints > 0;
            const isMe = p.name === me;
            const color = PLAYER_COLORS[p.name] ?? '#f0ecff';
            const qs = quickStats[p.name];
            return (
              <div
                key={p.name}
                className={`relative glass lift rounded-2xl p-3 text-center overflow-hidden cursor-pointer select-none ${
                  isMe ? 'ring-2 ring-flood/60' : isLeader ? 'ring-1 ring-gold/40 leader-glow' : ''
                }`}
                onClick={() => setProfilePlayer(p.name)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setProfilePlayer(p.name)}
              >
                {isLeader && (
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent" />
                )}
                {isMe && (
                  <span className="absolute top-1.5 right-1.5 pill bg-flood/25 text-white border border-flood/40 text-[0.5rem] px-1.5 py-0.5 leading-none">You</span>
                )}
                {qs && qs.streak >= 2 && (
                  <span className="absolute top-1.5 left-1.5 text-[0.6rem] font-bold text-gold leading-none">🔥{qs.streak}</span>
                )}
                <div className="text-xl leading-none">{MEDAL[i] ?? `#${i + 1}`}</div>
                <h3 className="mt-1 text-sm font-black truncate">{p.name}</h3>
                <p className={`mt-0.5 text-2xl font-black tabular-nums leading-none ${isLeader ? 'text-gold' : 'text-white'}`}>
                  {p.totalPoints}
                </p>
                <p className="text-[0.55rem] text-white/40 uppercase tracking-wide">pts</p>
                <div className="mt-2 h-0.5 rounded-full overflow-hidden bg-white/8">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${leaderPts > 0 ? Math.max(6, Math.round((p.totalPoints / leaderPts) * 100)) : 0}%`,
                      backgroundColor: color,
                      transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Identity picker */}
      {idReady && !me && (
        <div className="px-4 pt-3">
          <div className="glass rounded-2xl p-5 text-center">
            <h2 className="font-bold text-base">Who are you?</h2>
            <p className="text-xs text-white/50 mt-1 mb-4">
              We'll remember on this phone and tell you when it's your turn.
            </p>
            <div className="flex gap-3">
              {PLAYERS.map(name => (
                <button
                  key={name}
                  onClick={() => choose(name)}
                  className="flex-1 rounded-xl py-3.5 font-bold bg-white/8 hover:bg-flood/20 border border-white/12 hover:border-flood/40 transition-all text-sm"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notifications row (when logged in) */}
      {idReady && me && (notifStatus === 'default' || notifStatus === 'subscribed') && (
        <div className="px-4 pt-2 flex justify-end">
          {notifStatus === 'default' && (
            <button
              onClick={notifSubscribe}
              disabled={notifLoading}
              className="pill bg-white/8 text-white/60 border border-white/12 hover:bg-white/15 transition-colors text-xs"
            >
              {notifLoading ? '…' : '🔔 Enable notifications'}
            </button>
          )}
          {notifStatus === 'subscribed' && (
            <button
              onClick={notifUnsubscribe}
              disabled={notifLoading}
              className="pill bg-grass/10 text-grass border border-grass/20 text-xs"
            >
              🔔 Notifs on
            </button>
          )}
        </div>
      )}

      {/* Your turn banner */}
      {me && myTurnFixtures.length > 0 && (
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 border border-flood/35 bg-flood/10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">🔔</span>
              <span className="text-sm font-semibold truncate">
                Your turn · {myTurnFixtures.length} match{myTurnFixtures.length > 1 ? 'es' : ''} waiting
              </span>
            </div>
            <a
              href={`/matches/${myTurnFixtures[0].id}`}
              className="pill bg-flood/30 text-white border border-flood/50 text-xs shrink-0"
            >
              Bet →
            </a>
          </div>
        </div>
      )}

      {/* Next kickoff countdown */}
      {nextFixture && (() => {
        const k = new Date(nextFixture.scheduledKickoff);
        const c = countdownHMS(k, now);
        if (!c) return null;
        return (
          <div className="px-4 pt-3">
            <div className="glass-soft rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[0.6rem] uppercase tracking-[.2em] text-flood font-semibold">Next kickoff</p>
                <p className="text-xs font-bold truncate mt-0.5">
                  {flag(nextFixture.homeTeam.name)} {nextFixture.homeTeam.name} <span className="text-white/40">v</span> {nextFixture.awayTeam.name} {flag(nextFixture.awayTeam.name)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {c.d > 0 && <TimeCell v={c.d} label="d" />}
                <TimeCell v={c.h} label="h" />
                <TimeCell v={c.m} label="m" />
                <TimeCell v={c.s} label="s" />
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Swipeable match deck ── */}
      {filteredUpcoming.length === 0 ? (
        <div className="px-4 pt-4">
          <div className="glass rounded-3xl p-12 text-center text-white/50">
            <div className="text-5xl mb-3">🏆</div>
            <p className="font-bold">{upcomingFixtures.length === 0 ? 'All matches settled!' : `No ${phaseFilter ?? 'upcoming'} matches.`}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Deck container */}
          <div
            className="overflow-hidden pt-3"
            onTouchStart={handleTouchStart}
            onTouchEnd={e => handleTouchEnd(e, filteredUpcoming.length - 1)}
          >
                <div
                  className="flex transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(-${clampedDeckIndex * 100}%)` }}
                >
                  {filteredUpcoming.map(f => {
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
                      <div key={f.id} className="w-full shrink-0 px-4">
                        <article className="glass rounded-3xl p-5 flex flex-col gap-4" style={{ minHeight: '58vh' }}>

                          {/* Top meta row */}
                          <div className="flex items-center justify-between text-xs">
                            <div className="min-w-0 truncate">
                              <span className="text-white/40">{f.venue ?? '—'}</span>
                              {f.stage && <span className="text-white/25 ml-1.5">· {f.stage}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {result && <SourceBadge source={result.source} />}
                              {statusPill}
                            </div>
                          </div>

                          {/* ── HERO: teams + score ── */}
                          <div className="flex-1 flex flex-col items-center justify-center gap-3">
                            <div className="flex items-center justify-center gap-3 w-full">
                              {/* Home */}
                              <div className="flex-1 text-center">
                                <div className="text-7xl leading-none drop-shadow-xl">{flag(f.homeTeam.name)}</div>
                                <div className="mt-3 text-base font-black leading-tight px-1">{f.homeTeam.name}</div>
                              </div>

                              {/* Score / VS */}
                              <div className="shrink-0 text-center min-w-[4.5rem]">
                                {result ? (
                                  <div className="text-4xl font-black tabular-nums score-reveal leading-none">
                                    {result.homeScore90}
                                    <span className="text-white/20 mx-0.5">–</span>
                                    {result.awayScore90}
                                  </div>
                                ) : live ? (
                                  <div>
                                    <div className="text-4xl font-black tabular-nums text-rose leading-none">
                                      {live.homeGoals}<span className="text-rose/40 mx-0.5">–</span>{live.awayGoals}
                                    </div>
                                    <div className="text-[0.58rem] text-rose/80 uppercase tracking-wide mt-1 flex items-center justify-center gap-1">
                                      <span className="live-dot-red" />{liveLabel(live)}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-3xl font-black text-white/15 leading-none">VS</div>
                                )}
                              </div>

                              {/* Away */}
                              <div className="flex-1 text-center">
                                <div className="text-7xl leading-none drop-shadow-xl">{flag(f.awayTeam.name)}</div>
                                <div className="mt-3 text-base font-black leading-tight px-1">{f.awayTeam.name}</div>
                              </div>
                            </div>

                            {/* Kickoff + countdown */}
                            <div className="text-center mt-1">
                              <p className="text-white/50 text-sm">{formatKickoff(kickoff, todayKey, tomorrowKey)}</p>
                              {cd && !isLocked && (
                                <p className="text-flood font-black text-xl mt-0.5">{cd}</p>
                              )}
                            </div>
                          </div>

                          {/* ── Betting progress ── */}
                          <div className="glass-soft rounded-2xl p-3">
                            <div className="flex items-center justify-around">
                              {betOrder.map(name => {
                                const hasBet = preds.some(p => p.userName === name);
                                const isCurrent = name === current && !isLocked;
                                const pc = playerColor(name);
                                const circleStyle =
                                  hasBet ? { backgroundColor: `${pc}33`, color: pc } :
                                  isCurrent ? { backgroundColor: `${pc}26`, color: pc, boxShadow: `0 0 0 2px ${pc}66` } :
                                  { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' };
                                return (
                                  <div key={name} className="flex flex-col items-center gap-1">
                                    <span
                                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                                      style={circleStyle}
                                    >
                                      {hasBet ? '✓' : isCurrent ? '⏳' : name[0]}
                                    </span>
                                    <span
                                      className="text-[0.7rem] font-medium"
                                      style={{ color: isCurrent || hasBet ? pc : 'rgba(255,255,255,0.4)' }}
                                    >
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

                          {/* Revealed predictions */}
                          {reveal && preds.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-2 text-xs">
                              {preds.map(p => (
                                <PredPill key={p.userName} name={p.userName} home={p.homeScore} away={p.awayScore} homeET={p.homeScoreExtraTime} awayET={p.awayScoreExtraTime} />
                              ))}
                            </div>
                          )}

                          {/* CTA */}
                          <a
                            href={`/matches/${f.id}`}
                            className={`btn ${isLocked ? 'btn-ghost' : 'btn-primary'} w-full py-4 text-base`}
                          >
                            {isLocked ? 'View match & scoring' : current ? `Place ${current}'s bet →` : 'View predictions →'}
                          </a>
                        </article>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Deck navigation ── */}
              {filteredUpcoming.length > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3 px-4">
                  <button
                    onClick={() => setDeckIndex(i => Math.max(0, i - 1))}
                    disabled={clampedDeckIndex === 0}
                    className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/70 disabled:opacity-20 transition-opacity text-lg leading-none"
                    aria-label="Previous match"
                  >
                    ‹
                  </button>
                  <div className="flex gap-1.5">
                    {filteredUpcoming.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setDeckIndex(i)}
                        aria-label={`Match ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all duration-200 ${i === clampedDeckIndex ? 'w-5 bg-flood' : 'w-1.5 bg-white/25'}`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setDeckIndex(i => Math.min(filteredUpcoming.length - 1, i + 1))}
                    disabled={clampedDeckIndex === filteredUpcoming.length - 1}
                    className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/70 disabled:opacity-20 transition-opacity text-lg leading-none"
                    aria-label="Next match"
                  >
                    ›
                  </button>
                </div>
              )}

              {/* Phase filter pills */}
              {upcomingPhases.length > 1 && (
                <div className="flex gap-2 mt-4 px-4 overflow-x-auto pb-1">
                  <button
                    onClick={() => { setPhaseFilter(null); setDeckIndex(0); }}
                    className={`pill shrink-0 border transition-colors ${!phaseFilter ? 'bg-flood/25 text-white border-flood/40' : 'bg-white/8 text-white/50 border-white/12 hover:bg-white/12'}`}
                  >
                    All ({upcomingFixtures.length})
                  </button>
                  {upcomingPhases.map(phase => (
                    <button
                      key={phase}
                      onClick={() => { setPhaseFilter(phaseFilter === phase ? null : phase); setDeckIndex(0); }}
                      className={`pill shrink-0 border transition-colors ${phaseFilter === phase ? 'bg-flood/25 text-white border-flood/40' : 'bg-white/8 text-white/50 border-white/12 hover:bg-white/12'}`}
                    >
                      {phase}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Stats & History link */}
          <div className="px-4 mt-4">
            <a
              href="/stats"
              className="glass lift rounded-2xl p-4 flex items-center justify-between hover:bg-white/8 transition-colors"
            >
              <div>
                <h2 className="font-bold text-sm">📊 Stats &amp; History</h2>
                <p className="text-xs text-white/50 mt-0.5">Accuracy, streaks and head-to-head</p>
              </div>
              <span className="text-white/40 text-lg ml-4">→</span>
            </a>
          </div>

      {/* ── Past results (accordion) ── */}
      <section className="px-4 mt-4 mb-4">
        <button
          onClick={() => setShowPast(v => !v)}
          className="w-full flex items-center justify-between mb-3 px-1 group"
        >
          <h2 className="text-white/50 uppercase tracking-widest text-xs font-semibold">Past Results</h2>
          <span className="flex items-center gap-2">
            <span className="text-white/30 text-xs">{filteredPast.length} matches</span>
            <span className={`text-white/30 text-xs transition-transform duration-200 ${showPast ? 'rotate-180' : ''}`}>▲</span>
          </span>
        </button>

        {showPast && (
          filteredPast.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-white/40 text-sm">
              No completed matches yet — results will appear here once games are settled.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPast.map(f => {
                const kickoff = new Date(f.scheduledKickoff);
                const preds = toDomainPreds(data.predictions, f.id);
                const result = data.results?.[f.id];
                const ptsMap = predPointsMap(data, f.id);
                const topPts = Math.max(0, ...Object.values(ptsMap));
                return (
                  <article key={f.id} className="glass lift rounded-3xl p-5 flex flex-col gap-4 opacity-90">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-white/40">{formatKickoff(kickoff, todayKey, tomorrowKey)}</span>
                        {f.stage && <span className="text-white/25 ml-1.5">· {f.stage}</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {result && <SourceBadge source={result.source} />}
                        {result
                          ? <span className="pill bg-gold/12 text-gold border border-gold/20">Final</span>
                          : <span className="pill bg-white/8 text-white/50">No result yet</span>
                        }
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 text-center">
                        <div className="text-5xl leading-none drop-shadow-lg">{flag(f.homeTeam.name)}</div>
                        <div className="mt-2 text-sm font-bold leading-tight">{f.homeTeam.name}</div>
                      </div>
                      <div className="px-2 text-center">
                        {result ? (
                          <div className="text-2xl font-black tabular-nums score-reveal">
                            {result.homeScore90}<span className="text-white/30 mx-1">–</span>{result.awayScore90}
                          </div>
                        ) : (
                          <div className="text-white/30 font-black text-lg">–</div>
                        )}
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-5xl leading-none drop-shadow-lg">{flag(f.awayTeam.name)}</div>
                        <div className="mt-2 text-sm font-bold leading-tight">{f.awayTeam.name}</div>
                      </div>
                    </div>
                    {preds.length > 0 ? (
                      <div className="glass-soft p-3">
                        <p className="text-xs text-white/40 text-center mb-2 uppercase tracking-wide">Predictions</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {preds.map(p => {
                            const pts = ptsMap[p.userName];
                            const isTop = result != null && topPts > 0 && pts === topPts;
                            return (
                              <span key={p.userName} className={isTop ? 'relative' : undefined}>
                                {isTop && <span className="absolute -top-2 -right-1 text-[0.7rem] leading-none z-10" title="Best call this match">👑</span>}
                                <PredPill name={p.userName} home={p.homeScore} away={p.awayScore} homeET={p.homeScoreExtraTime} awayET={p.awayScoreExtraTime} pts={result ? pts : null} />
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-center text-xs text-white/30">No predictions placed</p>
                    )}
                    <a href={`/matches/${f.id}`} className="btn btn-ghost w-full py-3 text-sm">
                      View scoring breakdown →
                    </a>
                  </article>
                );
              })}
            </div>
          )
        )}
      </section>

      <footer className="text-center text-white/25 text-xs pt-2 pb-6 px-4">
        Auto-syncs across all devices · ANJ Predictions
      </footer>

      {/* ── Celebration toast ── */}
      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
          <div className="glass rounded-2xl px-5 py-3 border border-gold/40 bg-gold/12 text-center animate-rise shadow-2xl">
            <p className="text-2xl">🎉</p>
            <p className="font-bold text-gold mt-0.5">{toast}</p>
          </div>
        </div>
      )}

      {/* ── Player Profile Modal ── */}
      {profilePlayer && (() => {
        const profile = computePlayerProfile(data, profilePlayer);
        const color = PLAYER_COLORS[profilePlayer] ?? '#f0ecff';
        const player = sortedPlayers.find(p => p.name === profilePlayer);
        const rank = player ? sortedPlayers.indexOf(player) + 1 : null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setProfilePlayer(null)}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
              className="relative glass rounded-3xl p-6 w-full max-w-sm animate-rise z-10"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-2xl font-black shrink-0"
                    style={{ background: `${color}22`, color }}
                  >
                    {profilePlayer[0]}
                  </div>
                  <div>
                    <h3 className="text-xl font-black">{profilePlayer}</h3>
                    <p className="text-xs text-white/40">{profile.settled} settled · {rank ? `#${rank} overall` : ''}</p>
                  </div>
                </div>
                <button
                  onClick={() => setProfilePlayer(null)}
                  className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 text-white/60 flex items-center justify-center text-sm transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="text-center mb-5">
                <p className="text-5xl font-black tabular-nums" style={{ color }}>{profile.totalPoints}</p>
                <p className="text-xs text-white/40 uppercase tracking-wide mt-1">total points</p>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: 'Accuracy', value: profile.settled > 0 ? `${Math.round(profile.correct / profile.settled * 100)}%` : '—', sub: `${profile.correct}/${profile.settled} correct` },
                  { label: 'Exact Scores', value: profile.exact, sub: `${profile.settled > 0 ? Math.round(profile.exact / profile.settled * 100) : 0}% hit rate` },
                  { label: 'Possession', value: profile.possession, sub: `${profile.settled > 0 ? Math.round(profile.possession / profile.settled * 100) : 0}% accurate` },
                  { label: '1st Scorer', value: profile.scorer, sub: `${profile.settled > 0 ? Math.round(profile.scorer / profile.settled * 100) : 0}% accurate` },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="glass-soft p-3 text-center">
                    <p className="text-xl font-black tabular-nums">{value}</p>
                    <p className="text-[0.65rem] text-white/40 uppercase tracking-wide">{label}</p>
                    {sub && <p className="text-[0.6rem] text-white/30 mt-0.5">{sub}</p>}
                  </div>
                ))}
              </div>

              <div className="glass-soft p-4 space-y-3 mb-4">
                <ProfileBar label="Outcome accuracy" value={profile.settled > 0 ? profile.correct / profile.settled : 0} count={`${profile.correct}/${profile.settled}`} color={color} />
                <ProfileBar label="Exact score" value={profile.settled > 0 ? profile.exact / profile.settled : 0} count={`${profile.exact}/${profile.settled}`} color="#fbbf24" />
                <ProfileBar label="Possession" value={profile.settled > 0 ? profile.possession / profile.settled : 0} count={`${profile.possession}/${profile.settled}`} color="#34d399" />
                <ProfileBar label="First scorer" value={profile.settled > 0 ? profile.scorer / profile.settled : 0} count={`${profile.scorer}/${profile.settled}`} color="#f87171" />
              </div>

              <div className="flex gap-2">
                {profile.streak >= 1 && (
                  <div className="glass-soft p-3 flex-1 text-center">
                    <p className="text-lg font-black">{'🔥'.repeat(Math.min(profile.streak, 5))} {profile.streak}</p>
                    <p className="text-[0.65rem] text-white/40 uppercase tracking-wide">current streak</p>
                  </div>
                )}
                {profile.bestMatch && (
                  <div className="glass-soft p-3 flex-1 text-center">
                    <p className="text-lg font-black text-gold">+{profile.bestMatch.pts} pts</p>
                    <p className="text-[0.65rem] text-white/40 uppercase tracking-wide">best match</p>
                    <p className="text-[0.6rem] text-white/30 truncate">{profile.bestMatch.home} v {profile.bestMatch.away}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
