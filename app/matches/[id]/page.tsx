'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { fixtureOrder, currentEligiblePlayer, shouldReveal, scorePrediction } from '@/lib/domain';
import { squads } from '@/lib/squads';
import { flag } from '@/lib/flags';
import { useIdentity } from '@/lib/useIdentity';
import { fireConfetti } from '@/lib/confetti';
import type { StoredResult } from '@/lib/results-store';

const TIMEZONE = 'Asia/Dubai';
const POLL_MS = 10_000;
const PLAYERS = ['Anthony', 'Nicolas', 'Jean'] as const;


type TeamInfo = { name: string; shortName: string | null };
type ApiFixture = { id: string; scheduledKickoff: string; venue: string | null; status: string; playerOrder: string[] | null; homeTeam: TeamInfo; awayTeam: TeamInfo };
type ApiPrediction = {
  id: string; fixtureId: string; user: { name: string };
  predictedHomeScore90: number | null; predictedAwayScore90: number | null;
  possession: string | null; firstGoalscorer: string | null;
  homeScoreExtraTime: number | null; awayScoreExtraTime: number | null;
  homePenaltyScore: number | null; awayPenaltyScore: number | null;
  submittedAt: string | null; status: string; score: { totalPoints: number } | null;
};
type ApiPlayer = { id: string; name: string; totalPoints: number };
type DashboardData = { fixtures: ApiFixture[]; predictions: ApiPrediction[]; players: ApiPlayer[]; results?: Record<string, StoredResult> };

function ScoreInput({ value, onChange, label, flag }: { value: number; onChange: (v: number) => void; label: string; flag?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-white/55 text-center max-w-[6rem] leading-tight">{flag ? `${flag} ` : ''}{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" className="stepper" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
        <span className="w-9 text-center text-3xl font-black tabular-nums">{value}</span>
        <button type="button" className="stepper" onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const { me, ready: idReady } = useIdentity();
  const [data, setData] = useState<DashboardData | null>(null);

  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [possession, setPossession] = useState('');
  const [firstGoalscorer, setFirstGoalscorer] = useState('');
  const [hasET, setHasET] = useState(false);
  const [homeET, setHomeET] = useState(0);
  const [awayET, setAwayET] = useState(0);
  const [hasPenalties, setHasPenalties] = useState(false);
  const [homePenalty, setHomePenalty] = useState(0);
  const [awayPenalty, setAwayPenalty] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [showResultForm, setShowResultForm] = useState(false);
  const [rHome90, setRHome90] = useState(0);
  const [rAway90, setRAway90] = useState(0);
  const [rHomePoss, setRHomePoss] = useState(50);
  const [rFirstScorer, setRFirstScorer] = useState('');
  const [rHasET, setRHasET] = useState(false);
  const [rHomeET, setRHomeET] = useState(0);
  const [rAwayET, setRAwayET] = useState(0);
  const [rHasPenalties, setRHasPenalties] = useState(false);
  const [rHomePenalty, setRHomePenalty] = useState(0);
  const [rAwayPenalty, setRAwayPenalty] = useState(0);
  const [savingResult, setSavingResult] = useState(false);

  const load = () =>
    fetch('/api/predictions')
      .then(r => r.json() as Promise<DashboardData>)
      .then(setData)
      .catch(console.error);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Pre-select whoever owns this device, so betting is one tap not three.
  useEffect(() => {
    if (idReady && me && !selectedPlayer) setSelectedPlayer(me);
  }, [idReady, me, selectedPlayer]);

  // Reset edit mode when switching player selection.
  useEffect(() => {
    setEditMode(false);
    setSubmitResult(null);
  }, [selectedPlayer]);

  if (!data) {
    return (
      <main className="min-h-screen p-8 flex flex-col items-center justify-center gap-3">
        <div className="live-dot" />
        <p className="text-white/60">Loading match…</p>
      </main>
    );
  }

  const fixture = data.fixtures.find(f => f.id === id);
  if (!fixture) {
    return (
      <main className="min-h-screen p-8 flex flex-col items-center justify-center gap-4">
        <p className="text-white/60">Match not found.</p>
        <a href="/" className="btn btn-ghost px-5 py-2 text-sm">← Back to Dashboard</a>
      </main>
    );
  }

  const kickoff = new Date(fixture.scheduledKickoff);
  const now = new Date();
  const isLocked = now >= kickoff;
  const minutesUntilKickoff = (kickoff.getTime() - now.getTime()) / 60_000;
  const canEdit = !isLocked && minutesUntilKickoff > 30;
  const betOrder = fixtureOrder(kickoff, fixture.venue, fixture.homeTeam.name, fixture.awayTeam.name);

  const preds = data.predictions
    .filter(p => p.fixtureId === fixture.id && p.status !== 'WAITING' && p.submittedAt)
    .map(p => ({
      userName: p.user.name,
      homeScore: p.predictedHomeScore90 ?? 0,
      awayScore: p.predictedAwayScore90 ?? 0,
      possession: p.possession,
      firstGoalscorer: p.firstGoalscorer,
      homeScoreExtraTime: p.homeScoreExtraTime,
      awayScoreExtraTime: p.awayScoreExtraTime,
      homePenaltyScore: p.homePenaltyScore,
      awayPenaltyScore: p.awayPenaltyScore,
      submittedAt: new Date(p.submittedAt!),
      forfeited: p.status === 'FORFEITED',
    }));

  const current = currentEligiblePlayer(betOrder, preds);
  const reveal = shouldReveal(betOrder, preds, { id: fixture.id, kickoff }, now);
  const result = data.results?.[fixture.id];

  const homeSquad = squads[fixture.homeTeam.name] ?? [];
  const awaySquad = squads[fixture.awayTeam.name] ?? [];
  const homeFlag = flag(fixture.homeTeam.name);
  const awayFlag = flag(fixture.awayTeam.name);

  const handleEnterEditMode = () => {
    if (!selectedPlayer || !data) return;
    const existing = data.predictions.find(
      p => p.fixtureId === id && p.user.name === selectedPlayer && p.submittedAt
    );
    if (existing) {
      setHomeScore(existing.predictedHomeScore90 ?? 0);
      setAwayScore(existing.predictedAwayScore90 ?? 0);
      setPossession(existing.possession ?? '');
      setFirstGoalscorer(existing.firstGoalscorer ?? '');
      if (existing.homeScoreExtraTime != null) {
        setHasET(true);
        setHomeET(existing.homeScoreExtraTime);
        setAwayET(existing.awayScoreExtraTime ?? 0);
      } else {
        setHasET(false);
        setHomeET(0);
        setAwayET(0);
      }
      if (existing.homePenaltyScore != null) {
        setHasPenalties(true);
        setHomePenalty(existing.homePenaltyScore);
        setAwayPenalty(existing.awayPenaltyScore ?? 0);
      } else {
        setHasPenalties(false);
        setHomePenalty(0);
        setAwayPenalty(0);
      }
    }
    setEditMode(true);
    setSubmitResult(null);
  };

  const handleBet = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const body = {
        fixtureId: fixture.id,
        userName: selectedPlayer,
        homeScore,
        awayScore,
        ...(possession ? { possession } : {}),
        ...(firstGoalscorer ? { firstGoalscorer } : {}),
        ...(hasET ? { homeScoreExtraTime: homeET, awayScoreExtraTime: awayET } : {}),
        ...(hasPenalties ? { homePenaltyScore: homePenalty, awayPenaltyScore: awayPenalty } : {}),
      };
      const resp = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      setSubmitResult(json);
      if (json.ok) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([18, 40, 22]);
        fireConfetti();
        await load();
        setHomeScore(0); setAwayScore(0); setPossession(''); setFirstGoalscorer('');
        setHasET(false); setHasPenalties(false); setHomeET(0); setAwayET(0);
        setHomePenalty(0); setAwayPenalty(0);
        setSelectedPlayer('');
        setEditMode(false);
      }
    } catch {
      setSubmitResult({ ok: false, reason: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveResult = async () => {
    setSavingResult(true);
    try {
      const body = {
        fixtureId: fixture.id,
        homeScore90: rHome90,
        awayScore90: rAway90,
        homePossession: rHomePoss,
        awayPossession: 100 - rHomePoss,
        firstGoalscorer: rFirstScorer || null,
        ...(rHasET ? { homeScoreExtraTime: rHomeET, awayScoreExtraTime: rAwayET } : {}),
        ...(rHasPenalties ? { homePenaltyScore: rHomePenalty, awayPenaltyScore: rAwayPenalty } : {}),
      };
      const resp = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (json.ok) {
        setShowResultForm(false);
        await load();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingResult(false);
    }
  };

  const isTurn = selectedPlayer && selectedPlayer === current;
  const alreadyBet = selectedPlayer ? preds.some(p => p.userName === selectedPlayer) : false;
  const outcomeLabel = (home: number, away: number) =>
    home > away ? fixture.homeTeam.name : away > home ? fixture.awayTeam.name : 'Draw';

  const kickoffStr = kickoff.toLocaleString('en-GB', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* ---------- Header ---------- */}
        <div className="glass rounded-3xl p-6 animate-rise">
          <a href="/" className="inline-flex items-center gap-1.5 text-flood text-sm font-medium hover:gap-2.5 transition-all">
            ← Back to Dashboard
          </a>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex-1 text-center">
              <div className="text-5xl md:text-6xl leading-none">{homeFlag}</div>
              <div className="mt-2 font-bold text-base md:text-lg leading-tight">{fixture.homeTeam.name}</div>
            </div>
            <div className="px-1 text-center">
              {result ? (
                <div className="text-3xl md:text-4xl font-black tabular-nums score-reveal">
                  {result.homeScore90}<span className="text-white/30 mx-1.5">–</span>{result.awayScore90}
                </div>
              ) : (
                <div className="text-white/30 font-black text-xl">VS</div>
              )}
            </div>
            <div className="flex-1 text-center">
              <div className="text-5xl md:text-6xl leading-none">{awayFlag}</div>
              <div className="mt-2 font-bold text-base md:text-lg leading-tight">{fixture.awayTeam.name}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-white/55">
            <span>📍 {fixture.venue}</span>
            <span className="text-white/20">·</span>
            <span>🕐 {kickoffStr}</span>
          </div>

          {/* Turn order */}
          <div className="mt-5 glass-soft p-4">
            <p className="text-xs text-white/45 uppercase tracking-wide mb-3">Betting order</p>
            <div className="flex items-center justify-between gap-2">
              {betOrder.map((name, i) => {
                const pred = preds.find(p => p.userName === name);
                const isCurrentTurn = name === current && !isLocked;
                return (
                  <div key={name} className="flex items-center gap-2 flex-1">
                    <div className="flex-1 flex flex-col items-center gap-1.5">
                      <span
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold ${
                          pred ? 'bg-grass/20 text-grass' :
                          isCurrentTurn ? 'bg-flood/20 text-flood ring-2 ring-flood/40' :
                          'bg-white/8 text-white/40'
                        }`}
                      >
                        {pred ? '✓' : isCurrentTurn ? '⏳' : name[0]}
                      </span>
                      <span className={`text-xs ${isCurrentTurn ? 'text-flood font-semibold' : 'text-white/50'}`}>{name}</span>
                    </div>
                    {i < betOrder.length - 1 && <span className="text-white/20 -mt-5">→</span>}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-center text-sm">
              {isLocked && !result && <span className="text-rose">🔒 Match started — betting closed</span>}
              {!isLocked && current && <span className="text-flood">It&apos;s <b>{current}</b>&apos;s turn to bet</span>}
              {!isLocked && !current && <span className="text-grass">✓ Everyone has placed their bets</span>}
              {isLocked && result && <span className="text-gold">Result recorded — see scoring below</span>}
            </p>
          </div>
        </div>

        {/* ---------- Betting slip ---------- */}
        {!isLocked && (
          <div className="glass rounded-3xl p-6 animate-rise" style={{ animationDelay: '60ms' }}>
            <h2 className="text-lg font-bold mb-1">Place a Bet</h2>
            <p className="text-sm text-white/45 mb-4">Select who you are, then enter your prediction.</p>

            {/* Player selector */}
            <div className="mb-5">
              <div className="grid grid-cols-3 gap-2">
                {PLAYERS.map(p => {
                  const hasBet = preds.some(pr => pr.userName === p);
                  const isActive = selectedPlayer === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={hasBet}
                      onClick={() => { setSelectedPlayer(p); setSubmitResult(null); }}
                      className={`rounded-xl py-2.5 font-semibold text-sm transition-all ${
                        hasBet ? 'bg-grass/10 text-grass/70 cursor-default' :
                        isActive ? 'bg-flood text-pitch shadow-lg' :
                        'bg-white/8 hover:bg-white/15 text-white'
                      }`}
                    >
                      {hasBet ? `✓ ${p}` : p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Already bet — within edit window */}
            {selectedPlayer && alreadyBet && canEdit && !editMode && (
              <div className="rounded-2xl bg-grass/10 border border-grass/25 p-4 flex items-center justify-between gap-3">
                <p className="text-grass font-semibold text-sm">✓ {selectedPlayer} already placed a bet.</p>
                <button
                  type="button"
                  onClick={handleEnterEditMode}
                  className="pill bg-flood/20 text-flood border border-flood/35 hover:bg-flood/30 transition-colors shrink-0"
                >
                  ✏️ Edit bet
                </button>
              </div>
            )}

            {/* Already bet — locked or outside edit window */}
            {selectedPlayer && alreadyBet && !canEdit && !editMode && (
              <div className="rounded-2xl bg-grass/10 border border-grass/25 p-4 text-center">
                <p className="text-grass font-semibold">✓ {selectedPlayer} already placed a bet for this match.</p>
                {!isLocked && minutesUntilKickoff <= 30 && (
                  <p className="text-xs text-white/40 mt-1">Edit window closes 30 minutes before kickoff.</p>
                )}
              </div>
            )}

            {selectedPlayer && !alreadyBet && !isTurn && !editMode && (
              <div className="rounded-2xl bg-gold/10 border border-gold/25 p-4 text-center">
                <p className="text-gold">
                  It&apos;s not {selectedPlayer}&apos;s turn yet.
                  {current && <> Waiting for <b>{current}</b> to bet first.</>}
                </p>
              </div>
            )}

            {selectedPlayer && ((!alreadyBet && isTurn) || editMode) && (
              <form onSubmit={handleBet} className="space-y-4">
                {editMode && (
                  <div className="rounded-2xl bg-flood/10 border border-flood/25 p-3 flex items-center justify-between gap-2">
                    <p className="text-flood text-sm font-semibold">✏️ Editing {selectedPlayer}&apos;s bet</p>
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      className="text-xs text-white/45 hover:text-white/70 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {/* Score */}
                <div className="glass-soft p-4">
                  <p className="text-xs text-white/45 uppercase tracking-wide mb-4 text-center">90-minute score</p>
                  <div className="flex items-center justify-center gap-4">
                    <ScoreInput value={homeScore} onChange={setHomeScore} label={fixture.homeTeam.name} flag={homeFlag} />
                    <span className="text-2xl text-white/25 font-black mt-5">–</span>
                    <ScoreInput value={awayScore} onChange={setAwayScore} label={fixture.awayTeam.name} flag={awayFlag} />
                  </div>
                  <p className="text-center text-sm text-white/45 mt-3">
                    Predicted result: <span className="text-white font-semibold">{outcomeLabel(homeScore, awayScore)}</span>
                  </p>
                </div>

                {/* Possession */}
                <div>
                  <label className="block text-sm text-white/55 mb-1.5">🔄 Higher possession <span className="text-flood">+1 pt</span></label>
                  <select className="field" value={possession} onChange={e => setPossession(e.target.value)}>
                    <option value="">Skip — no possession bet</option>
                    <option value="HOME">{fixture.homeTeam.name} (Home)</option>
                    <option value="AWAY">{fixture.awayTeam.name} (Away)</option>
                    <option value="EQUAL">Equal (50/50)</option>
                  </select>
                </div>

                {/* First goalscorer */}
                <div>
                  <label className="block text-sm text-white/55 mb-1.5">⚽ First goalscorer <span className="text-flood">+1 pt</span></label>
                  <select className="field" value={firstGoalscorer} onChange={e => setFirstGoalscorer(e.target.value)}>
                    <option value="">Skip — no scorer bet</option>
                    <optgroup label={`${fixture.homeTeam.name}`}>
                      {homeSquad.map(name => <option key={name} value={name}>{name}</option>)}
                    </optgroup>
                    <optgroup label={`${fixture.awayTeam.name}`}>
                      {awaySquad.map(name => <option key={name} value={name}>{name}</option>)}
                    </optgroup>
                  </select>
                </div>

                {/* Extra time */}
                <div className="glass-soft p-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={hasET} onChange={e => { setHasET(e.target.checked); if (e.target.checked) { setHomeET(homeScore); setAwayET(awayScore); } }} className="w-5 h-5 accent-flood" />
                    <span className="text-sm">⏱️ Bet on the score after extra time <span className="text-flood">+1 pt</span></span>
                  </label>
                  {hasET && (
                    <>
                      <p className="text-xs text-white/40 text-center">Full score at the end of extra time (120′), not just the goals scored in ET.</p>
                      <div className="flex items-center justify-center gap-4 pt-2">
                        <ScoreInput value={homeET} onChange={setHomeET} label="After ET" flag={homeFlag} />
                        <span className="text-2xl text-white/25 font-black mt-5">–</span>
                        <ScoreInput value={awayET} onChange={setAwayET} label="After ET" flag={awayFlag} />
                      </div>
                    </>
                  )}
                </div>

                {/* Penalties */}
                <div className="glass-soft p-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={hasPenalties} onChange={e => setHasPenalties(e.target.checked)} className="w-5 h-5 accent-flood" />
                    <span className="text-sm">🥅 Bet on penalty shootout score <span className="text-flood">+1 pt</span></span>
                  </label>
                  {hasPenalties && (
                    <div className="flex items-center justify-center gap-4 pt-2">
                      <ScoreInput value={homePenalty} onChange={setHomePenalty} label="Penalties" flag={homeFlag} />
                      <span className="text-2xl text-white/25 font-black mt-5">–</span>
                      <ScoreInput value={awayPenalty} onChange={setAwayPenalty} label="Penalties" flag={awayFlag} />
                    </div>
                  )}
                </div>

                {submitResult && !submitResult.ok && (
                  <p className="rounded-xl bg-rose/15 border border-rose/30 px-4 py-3 text-rose text-sm">
                    {submitResult.reason}
                  </p>
                )}

                <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3.5 text-base">
                  {submitting ? 'Submitting…' : editMode ? `Update ${selectedPlayer}'s bet` : `Submit ${selectedPlayer}'s bet`}
                </button>

                <p className="text-center text-xs text-white/40 leading-relaxed">
                  Scoring: <b>1</b> correct outcome · <b>2</b> exact score · <b>+1</b> each for possession, first scorer, extra time &amp; penalties
                </p>
              </form>
            )}

            {submitResult?.ok && (
              <div className="mt-4 rounded-2xl bg-grass/12 border border-grass/30 p-4 text-center">
                <p className="text-grass font-semibold">✓ Bet submitted! Saved across all devices.</p>
              </div>
            )}
          </div>
        )}

        {/* ---------- Predictions & scoring ---------- */}
        <div className="glass rounded-3xl p-6 animate-rise" style={{ animationDelay: '120ms' }}>
          <h2 className="text-lg font-bold mb-4">Predictions &amp; Scoring</h2>

          {result ? (
            <div className="rounded-2xl bg-gold/8 border border-gold/25 p-4 mb-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-gold text-xs uppercase tracking-wide font-semibold">Official result</p>
                {result.source === 'auto'
                  ? <span className="pill bg-flood/12 text-flood border border-flood/20">⚡ Auto-synced</span>
                  : <span className="pill bg-white/8 text-white/55 border border-white/12">✍️ Manual</span>}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-white/45 text-xs">90-min score</p>
                  <p className="font-bold">{result.homeScore90}–{result.awayScore90}</p>
                </div>
                <div>
                  <p className="text-white/45 text-xs">Possession</p>
                  <p className="font-bold">{result.homePossession != null ? `${result.homePossession}%–${result.awayPossession}%` : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-white/45 text-xs">First scorer</p>
                  <p className="font-bold truncate">{result.firstGoalscorer ?? 'N/A'}</p>
                </div>
                {result.homeScoreExtraTime != null && (
                  <div>
                    <p className="text-white/45 text-xs">After extra time</p>
                    <p className="font-bold">{result.homeScoreExtraTime}–{result.awayScoreExtraTime}</p>
                  </div>
                )}
                {result.homePenaltyScore != null && (
                  <div>
                    <p className="text-white/45 text-xs">Penalties</p>
                    <p className="font-bold">{result.homePenaltyScore}–{result.awayPenaltyScore}</p>
                  </div>
                )}
              </div>
            </div>
          ) : isLocked ? (
            <div className="rounded-2xl bg-white/5 p-3 mb-4 text-sm text-white/55 flex items-center justify-between gap-2 flex-wrap">
              <span>No result entered yet.</span>
              <button onClick={() => setShowResultForm(v => !v)} className="text-flood font-medium hover:underline">
                {showResultForm ? 'Cancel' : '+ Enter result'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-white/5 p-3 mb-4 text-sm text-white/45">
              The result can be entered once the match kicks off.
            </div>
          )}

          {reveal ? (
            <div className="space-y-2">
              {betOrder.map(name => {
                const pred = preds.find(p => p.userName === name);
                if (!pred) {
                  return (
                    <div key={name} className="glass-soft p-3 flex items-center justify-between">
                      <span className="font-semibold">{name}</span>
                      <span className="text-white/35 text-sm">Forfeited</span>
                    </div>
                  );
                }
                let pts: number | null = null;
                let breakdown: string[] = [];
                if (result) {
                  const fixture2 = {
                    id: fixture.id, kickoff,
                    homeScore90: result.homeScore90, awayScore90: result.awayScore90,
                    homePossession: result.homePossession, awayPossession: result.awayPossession,
                    firstGoalscorerId: result.firstGoalscorer ?? null,
                    homeScoreExtraTime: result.homeScoreExtraTime ?? null, awayScoreExtraTime: result.awayScoreExtraTime ?? null,
                    homePenaltyScore: result.homePenaltyScore ?? null, awayPenaltyScore: result.awayPenaltyScore ?? null,
                  };
                  const s = scorePrediction({
                    homeScore: pred.homeScore, awayScore: pred.awayScore,
                    possession: pred.possession as 'HOME' | 'AWAY' | 'EQUAL' | undefined,
                    firstGoalscorerId: pred.firstGoalscorer ?? null,
                    homeScoreExtraTime: pred.homeScoreExtraTime ?? null, awayScoreExtraTime: pred.awayScoreExtraTime ?? null,
                    homePenaltyScore: pred.homePenaltyScore ?? null, awayPenaltyScore: pred.awayPenaltyScore ?? null,
                  }, fixture2);
                  pts = s.totalPoints;
                  breakdown = [
                    `Outcome ${s.outcomePoints}/1`,
                    `Score ${s.exactScorePoints}/2`,
                    ...(pred.possession ? [`Poss ${s.possessionPoints}/1`] : []),
                    ...(pred.firstGoalscorer ? [`Scorer ${s.firstGoalscorerPoints}/1`] : []),
                    ...(result.homeScoreExtraTime != null ? [`ET reached ${s.reachedExtraTimePoints}/1`, `ET score ${s.extraTimePoints}/1`] : []),
                    ...(result.homePenaltyScore != null ? [`Pens reached ${s.reachedPenaltiesPoints}/1`, `Pen score ${s.penaltyPoints}/1`] : []),
                  ];
                }
                const possLabel = pred.possession === 'HOME' ? fixture.homeTeam.name : pred.possession === 'AWAY' ? fixture.awayTeam.name : pred.possession === 'EQUAL' ? 'Equal' : null;
                return (
                  <div key={name} className="glass-soft p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black tabular-nums">
                          {pred.homeScoreExtraTime != null ? pred.homeScoreExtraTime : pred.homeScore}–{pred.homeScoreExtraTime != null ? pred.awayScoreExtraTime : pred.awayScore}
                        </span>
                        {pred.homeScoreExtraTime != null && (
                          <span className="pill bg-white/8 text-white/50 border border-white/12 text-[0.6rem] uppercase tracking-wide">AET</span>
                        )}
                        {pts != null && (
                          <span className="pill bg-gold/15 text-gold font-bold">{pts} pts</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/45">
                      {possLabel && <span>Possession: {possLabel}</span>}
                      {pred.firstGoalscorer && <span>Scorer: {pred.firstGoalscorer}</span>}
                      {pred.homeScoreExtraTime != null && <span>FT: {pred.homeScore}–{pred.awayScore}</span>}
                      {pred.homePenaltyScore != null && <span>Pen: {pred.homePenaltyScore}–{pred.awayPenaltyScore}</span>}
                    </div>
                    {breakdown.length > 0 && (
                      <p className="mt-1.5 text-[0.7rem] text-white/35">{breakdown.join(' · ')}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-white/45 text-sm text-center py-4">
              🔒 Predictions stay hidden until everyone submits or the match starts.
            </p>
          )}
        </div>

        {/* ---------- Result entry form ---------- */}
        {((showResultForm && !result) || (result && showResultForm)) && (
          <div className="glass rounded-3xl p-6 border border-flood/25 animate-rise">
            <h2 className="text-lg font-bold mb-1 text-flood">{result ? 'Edit official result' : 'Enter official result'}</h2>
            <p className="text-sm text-white/45 mb-5">{result ? 'Saving overwrites the result and recalculates all points.' : 'This settles the match and awards points to all players.'}</p>
            <div className="space-y-4">
              <div className="glass-soft p-4">
                <p className="text-xs text-white/45 uppercase tracking-wide mb-4 text-center">90-minute score</p>
                <div className="flex items-center justify-center gap-4">
                  <ScoreInput value={rHome90} onChange={setRHome90} label={fixture.homeTeam.name} flag={homeFlag} />
                  <span className="text-2xl text-white/25 font-black mt-5">–</span>
                  <ScoreInput value={rAway90} onChange={setRAway90} label={fixture.awayTeam.name} flag={awayFlag} />
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/55 mb-2">
                  Possession — <span className="text-white font-semibold">{fixture.homeTeam.name} {rHomePoss}%</span> · {fixture.awayTeam.name} {100 - rHomePoss}%
                </label>
                <input type="range" min={0} max={100} value={rHomePoss} onChange={e => setRHomePoss(Number(e.target.value))} className="w-full accent-flood" />
              </div>

              <div>
                <label className="block text-sm text-white/55 mb-1.5">First goalscorer</label>
                <select className="field" value={rFirstScorer} onChange={e => setRFirstScorer(e.target.value)}>
                  <option value="">None / no goal scored</option>
                  <optgroup label={fixture.homeTeam.name}>
                    {homeSquad.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                  <optgroup label={fixture.awayTeam.name}>
                    {awaySquad.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                </select>
              </div>

              <div className="glass-soft p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={rHasET} onChange={e => { setRHasET(e.target.checked); if (e.target.checked) { setRHomeET(rHome90); setRAwayET(rAway90); } }} className="w-5 h-5 accent-flood" />
                  <span className="text-sm">Extra time played?</span>
                </label>
                {rHasET && (
                  <>
                    <p className="text-xs text-white/40 text-center">Full score at the end of extra time (120′), not just the goals scored in ET.</p>
                    <div className="flex items-center justify-center gap-4 pt-2">
                      <ScoreInput value={rHomeET} onChange={setRHomeET} label="After ET" flag={homeFlag} />
                      <span className="text-2xl text-white/25 font-black mt-5">–</span>
                      <ScoreInput value={rAwayET} onChange={setRAwayET} label="After ET" flag={awayFlag} />
                    </div>
                  </>
                )}
              </div>

              <div className="glass-soft p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={rHasPenalties} onChange={e => setRHasPenalties(e.target.checked)} className="w-5 h-5 accent-flood" />
                  <span className="text-sm">Penalty shootout?</span>
                </label>
                {rHasPenalties && (
                  <div className="flex items-center justify-center gap-4 pt-2">
                    <ScoreInput value={rHomePenalty} onChange={setRHomePenalty} label="Penalties" flag={homeFlag} />
                    <span className="text-2xl text-white/25 font-black mt-5">–</span>
                    <ScoreInput value={rAwayPenalty} onChange={setRAwayPenalty} label="Penalties" flag={awayFlag} />
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={handleSaveResult} disabled={savingResult} className="btn btn-primary flex-1 py-3">
                  {savingResult ? 'Saving…' : result ? 'Update result' : 'Save result'}
                </button>
                <button onClick={() => setShowResultForm(false)} className="btn btn-ghost px-6 py-3">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit toggle when a result already exists */}
        {result && isLocked && !showResultForm && (
          <div className="text-center pb-4">
            <button onClick={() => setShowResultForm(true)} className="text-sm text-white/35 hover:text-white/60 transition-colors">
              Edit result
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
