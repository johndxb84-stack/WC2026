'use client';
import { useEffect, useState } from 'react';
import { currentEligiblePlayer, dateKeyInTimezone, orderForVenueDate, shouldReveal } from '@/lib/domain';
import { flag } from '@/lib/flags';
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

const MEDAL = ['🥇', '🥈', '🥉'];

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

  const todayFixtures = data.fixtures.filter(f => {
    const kickoff = new Date(f.scheduledKickoff);
    const kickoffKey = dateKeyInTimezone(kickoff, TIMEZONE);
    if (kickoffKey === todayKey) return true;
    if (kickoffKey === tomorrowKey) {
      const kickoffHourDubai = (kickoff.getUTCHours() + 4) % 24;
      return kickoffHourDubai < 10;
    }
    return false;
  }).sort((a, b) => new Date(a.scheduledKickoff).getTime() - new Date(b.scheduledKickoff).getTime());

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <section className="mx-auto max-w-5xl space-y-8">

        {/* ---------- Hero ---------- */}
        <header className="glass rounded-3xl p-6 md:p-9 animate-rise">
          <div className="flex items-center justify-between gap-3">
            <p className="text-flood uppercase tracking-[.3em] text-xs font-semibold">World Cup 2026</p>
            <button
              onClick={() => load()}
              className="pill bg-grass/10 text-grass border border-grass/20 hover:bg-grass/20 transition-colors"
            >
              <span className="live-dot" />
              {syncAge < 5 ? 'Live' : `synced ${syncAge}s ago`}
            </button>
          </div>

          <h1 className="mt-3 text-4xl md:text-6xl font-black tracking-tight">
            Prediction Arena
          </h1>

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
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------- Today's matches ---------- */}
        <section className="animate-rise" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-white/50 uppercase tracking-widest text-xs font-semibold">Today&apos;s Matches</h2>
            <span className="text-white/30 text-xs">{todayFixtures.length} to bet</span>
          </div>

          {todayFixtures.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-white/50">
              <div className="text-4xl mb-2">🌙</div>
              No matches today. Check back tomorrow!
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 md:gap-5">
              {todayFixtures.map(f => {
                const kickoff = new Date(f.scheduledKickoff);
                const fixtureOrder = orderForVenueDate(kickoff, f.venue);
                const preds = toDomainPreds(data.predictions, f.id);
                const current = currentEligiblePlayer(fixtureOrder, preds);
                const reveal = shouldReveal(fixtureOrder, preds, { id: f.id, kickoff }, now);
                const isLocked = now >= kickoff;
                const result = data.results?.[f.id];
                const cd = countdown(kickoff, now);
                const betCount = preds.length;

                let statusPill;
                if (result) {
                  statusPill = <span className="pill bg-gold/12 text-gold border border-gold/20">Result in</span>;
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
                      {statusPill}
                    </div>

                    {/* teams */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 text-center">
                        <div className="text-4xl md:text-5xl leading-none">{FLAG[f.homeTeam.name] ?? '⚽'}</div>
                        <div className="mt-2 text-sm md:text-base font-bold leading-tight">{f.homeTeam.name}</div>
                      </div>
                      <div className="px-2 text-center">
                        {result ? (
                          <div className="text-2xl md:text-3xl font-black tabular-nums">
                            {result.homeScore90}<span className="text-white/30 mx-1">–</span>{result.awayScore90}
                          </div>
                        ) : (
                          <div className="text-white/30 font-black text-lg">VS</div>
                        )}
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-4xl md:text-5xl leading-none">{FLAG[f.awayTeam.name] ?? '⚽'}</div>
                        <div className="mt-2 text-sm md:text-base font-bold leading-tight">{f.awayTeam.name}</div>
                      </div>
                    </div>

                    {/* kickoff */}
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <span className="text-white/60">{formatKickoff(kickoff, todayKey, tomorrowKey)}</span>
                      {cd && !isLocked && <span className="pill bg-white/8 text-flood">{cd}</span>}
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

        <footer className="text-center text-white/25 text-xs pt-2 pb-6">
          Auto-syncs across all devices · ANJ Predictions
        </footer>
      </section>
    </main>
  );
}
