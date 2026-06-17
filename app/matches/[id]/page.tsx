'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { dailyOrder, currentEligiblePlayer, shouldReveal, scorePrediction, outcome } from '@/lib/domain';
import { squads } from '@/lib/squads';
import type { StoredResult } from '@/lib/results-store';

const TIMEZONE = 'Asia/Dubai';
const POLL_MS = 30_000;
const PLAYERS = ['Nicolas', 'Jean', 'Anthony'] as const;

const FLAG: Record<string, string> = {
  'Spain': '🇪🇸', 'Cabo Verde': '🇨🇻', 'Belgium': '🇧🇪', 'Egypt': '🇪🇬',
  'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾', 'IR Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'France': '🇫🇷', 'Senegal': '🇸🇳', 'Iraq': '🇮🇶', 'Norway': '🇳🇴',
  'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴',
  'Portugal': '🇵🇹', 'DR Congo': '🇨🇩', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷',
  'Ghana': '🇬🇭', 'Panama': '🇵🇦', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴',
};

type TeamInfo = { name: string; shortName: string | null };
type ApiFixture = { id: string; scheduledKickoff: string; venue: string | null; status: string; homeTeam: TeamInfo; awayTeam: TeamInfo };
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

function ScoreInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-white/60">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 font-bold"
          onClick={() => onChange(Math.max(0, value - 1))}>−</button>
        <span className="w-8 text-center text-2xl font-black">{value}</span>
        <button type="button" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 font-bold"
          onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DashboardData | null>(null);

  // betting form
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

  // result entry
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
  const now = new Date();
  const isLocked = now >= kickoff;
  const fixtureOrder = dailyOrder(kickoff);

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

  const current = currentEligiblePlayer(fixtureOrder, preds);
  const reveal = shouldReveal(fixtureOrder, preds, { id: fixture.id, kickoff }, now);
  const result = data.results?.[fixture.id];

  const homeSquad = squads[fixture.homeTeam.name] ?? [];
  const awaySquad = squads[fixture.awayTeam.name] ?? [];

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
        await load();
        setHomeScore(0); setAwayScore(0); setPossession(''); setFirstGoalscorer('');
        setHasET(false); setHasPenalties(false); setHomeET(0); setAwayET(0);
        setHomePenalty(0); setAwayPenalty(0);
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

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-5">

        {/* Header */}
        <div className="glass rounded-3xl p-6">
          <a href="/" className="text-flood text-sm">← Back to Dashboard</a>
          <div className="mt-4 flex justify-between text-sm text-white/60">
            <span>{fixture.venue}</span>
            <span>{kickoff.toLocaleString('en-GB', { timeZone: TIMEZONE })}</span>
          </div>
          <div className="my-4 flex items-center justify-between text-2xl md:text-3xl font-black">
            <span>{FLAG[fixture.homeTeam.name] ?? ''} {fixture.homeTeam.name}</span>
            <span className="text-flood">vs</span>
            <span>{fixture.awayTeam.name} {FLAG[fixture.awayTeam.name] ?? ''}</span>
          </div>

          {/* Turn order */}
          <div className="rounded-2xl bg-black/25 p-4">
            <p className="text-sm font-semibold mb-2">
              <b>Betting order:</b> {fixtureOrder.join(' → ')}
            </p>
            <div className="flex flex-wrap gap-2">
              {fixtureOrder.map(name => {
                const pred = preds.find(p => p.userName === name);
                const isCurrentTurn = name === current;
                return (
                  <span
                    key={name}
                    className={`rounded-full px-3 py-1 text-sm ${
                      pred ? 'bg-green-500/20 text-green-300' :
                      isCurrentTurn ? 'bg-flood/20 text-flood font-bold' :
                      'bg-white/10 text-white/50'
                    }`}
                  >
                    {pred ? `✓ ${name}` : isCurrentTurn ? `⏳ ${name}` : name}
                  </span>
                );
              })}
            </div>
            {isLocked && !result && (
              <p className="mt-2 text-sm text-yellow-400">Match has started — betting is closed.</p>
            )}
            {current && !isLocked && (
              <p className="mt-2 text-sm text-flood">Current turn: <b>{current}</b></p>
            )}
            {!current && !isLocked && (
              <p className="mt-2 text-sm text-green-400">All bets submitted!</p>
            )}
          </div>
        </div>

        {/* Betting slip */}
        {!isLocked && (
          <div className="glass rounded-3xl p-6">
            <h2 className="text-xl font-bold mb-4">Betting Slip</h2>

            {/* Player selector */}
            <div className="mb-4">
              <label className="block text-sm text-white/60 mb-1">I am:</label>
              <div className="flex gap-2">
                {PLAYERS.map(p => {
                  const hasBet = preds.some(pr => pr.userName === p);
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={hasBet}
                      onClick={() => { setSelectedPlayer(p); setSubmitResult(null); }}
                      className={`flex-1 rounded-xl py-2 font-semibold transition-colors ${
                        hasBet ? 'bg-white/5 text-white/30 cursor-not-allowed' :
                        selectedPlayer === p ? 'bg-flood text-pitch' :
                        'bg-white/10 hover:bg-white/20'
                      }`}
                    >
                      {hasBet ? `✓ ${p}` : p}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPlayer && !alreadyBet && (
              <>
                {!isTurn ? (
                  <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/30 p-4 text-center">
                    <p className="text-yellow-400">
                      It&apos;s not {selectedPlayer}&apos;s turn yet.
                      {current && <> Waiting for <b>{current}</b> to bet first.</>}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleBet} className="space-y-5">
                    {/* Score */}
                    <div className="rounded-2xl bg-black/25 p-4">
                      <p className="text-sm text-white/60 mb-3 font-semibold">90-minute score prediction</p>
                      <div className="flex items-center justify-around gap-4">
                        <ScoreInput value={homeScore} onChange={setHomeScore} label={fixture.homeTeam.name} />
                        <span className="text-2xl text-white/40 font-black mt-4">—</span>
                        <ScoreInput value={awayScore} onChange={setAwayScore} label={fixture.awayTeam.name} />
                      </div>
                      <p className="text-center text-sm text-white/50 mt-2">
                        Result: <span className="text-white">{outcomeLabel(homeScore, awayScore)}</span>
                      </p>
                    </div>

                    {/* Possession */}
                    <div>
                      <label className="block text-sm text-white/60 mb-1">Higher possession (+1 pt):</label>
                      <select
                        value={possession}
                        onChange={e => setPossession(e.target.value)}
                        className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                      >
                        <option value="">N/A — no possession bet</option>
                        <option value="HOME">{fixture.homeTeam.name} (Home)</option>
                        <option value="AWAY">{fixture.awayTeam.name} (Away)</option>
                        <option value="EQUAL">Equal (50/50)</option>
                      </select>
                    </div>

                    {/* First goalscorer */}
                    <div>
                      <label className="block text-sm text-white/60 mb-1">First goalscorer (+1 pt):</label>
                      <select
                        value={firstGoalscorer}
                        onChange={e => setFirstGoalscorer(e.target.value)}
                        className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white"
                      >
                        <option value="">N/A — no first scorer bet</option>
                        <optgroup label={`── ${fixture.homeTeam.name} ──`}>
                          {homeSquad.map(name => <option key={name} value={name}>{name}</option>)}
                        </optgroup>
                        <optgroup label={`── ${fixture.awayTeam.name} ──`}>
                          {awaySquad.map(name => <option key={name} value={name}>{name}</option>)}
                        </optgroup>
                      </select>
                    </div>

                    {/* Extra time */}
                    <div className="rounded-2xl bg-black/25 p-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={hasET} onChange={e => setHasET(e.target.checked)}
                          className="w-4 h-4 accent-flood" />
                        <span className="text-sm">Extra time applicable? (+1 pt for exact ET score)</span>
                      </label>
                      {hasET && (
                        <div className="flex items-center justify-around gap-4 pt-2">
                          <ScoreInput value={homeET} onChange={setHomeET} label={`ET ${fixture.homeTeam.name}`} />
                          <span className="text-2xl text-white/40 font-black mt-4">—</span>
                          <ScoreInput value={awayET} onChange={setAwayET} label={`ET ${fixture.awayTeam.name}`} />
                        </div>
                      )}
                    </div>

                    {/* Penalties */}
                    <div className="rounded-2xl bg-black/25 p-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={hasPenalties} onChange={e => setHasPenalties(e.target.checked)}
                          className="w-4 h-4 accent-flood" />
                        <span className="text-sm">Penalties applicable? (+1 pt for exact penalty score)</span>
                      </label>
                      {hasPenalties && (
                        <div className="flex items-center justify-around gap-4 pt-2">
                          <ScoreInput value={homePenalty} onChange={setHomePenalty} label={`Pen ${fixture.homeTeam.name}`} />
                          <span className="text-2xl text-white/40 font-black mt-4">—</span>
                          <ScoreInput value={awayPenalty} onChange={setAwayPenalty} label={`Pen ${fixture.awayTeam.name}`} />
                        </div>
                      )}
                    </div>

                    {submitResult && !submitResult.ok && (
                      <p className="rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-3 text-red-300">
                        {submitResult.reason}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-full bg-flood text-pitch font-bold py-3 text-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {submitting ? 'Submitting…' : `Submit ${selectedPlayer}'s bet`}
                    </button>

                    <p className="text-center text-xs text-white/40">
                      Points: 1 outcome · 2 exact score · +1 possession · +1 first scorer
                    </p>
                  </form>
                )}
              </>
            )}

            {selectedPlayer && alreadyBet && (
              <div className="rounded-2xl bg-green-500/10 border border-green-500/30 p-4 text-center">
                <p className="text-green-400 font-semibold">✓ {selectedPlayer} has already submitted a bet for this match.</p>
              </div>
            )}

            {submitResult?.ok && (
              <div className="mt-4 rounded-2xl bg-green-500/10 border border-green-500/30 p-4 text-center">
                <p className="text-green-400 font-semibold">✓ Bet submitted successfully!</p>
              </div>
            )}
          </div>
        )}

        {/* Predictions breakdown */}
        <div className="glass rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-4">Predictions &amp; Scoring</h2>

          {/* Official result */}
          {result ? (
            <div className="rounded-2xl bg-flood/10 border border-flood/30 p-4 mb-4">
              <p className="text-flood text-sm font-semibold mb-2">Official result used for scoring</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-white/50">90-min score</p>
                  <p className="font-bold">{fixture.homeTeam.name} {result.homeScore90}–{result.awayScore90} {fixture.awayTeam.name}</p>
                </div>
                <div>
                  <p className="text-white/50">Possession</p>
                  <p className="font-bold">
                    {result.homePossession != null
                      ? `${fixture.homeTeam.name} (${result.homePossession}%–${result.awayPossession}%)`
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-white/50">First scorer</p>
                  <p className="font-bold">{result.firstGoalscorer ?? 'N/A'}</p>
                </div>
                {result.homeScoreExtraTime != null && (
                  <div>
                    <p className="text-white/50">Extra time</p>
                    <p className="font-bold">{result.homeScoreExtraTime}–{result.awayScoreExtraTime}</p>
                  </div>
                )}
                {result.homePenaltyScore != null && (
                  <div>
                    <p className="text-white/50">Penalties</p>
                    <p className="font-bold">{result.homePenaltyScore}–{result.awayPenaltyScore}</p>
                  </div>
                )}
              </div>
            </div>
          ) : isLocked ? (
            <div className="rounded-2xl bg-white/5 p-3 mb-4 text-sm text-white/50">
              No result entered yet.{' '}
              <button onClick={() => setShowResultForm(v => !v)} className="text-flood underline">
                {showResultForm ? 'Cancel' : 'Enter result'}
              </button>
            </div>
          ) : null}

          {!isLocked && (
            <div className="rounded-2xl bg-white/5 p-3 mb-4 text-sm text-white/50">
              Result can be entered after the match starts.
            </div>
          )}

          {/* Predictions table */}
          {reveal ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-white/50 border-b border-white/10">
                    <th className="pb-2 pr-4">Player</th>
                    <th className="pb-2 pr-4">90-min</th>
                    <th className="pb-2 pr-4">Possession</th>
                    <th className="pb-2 pr-4">First scorer</th>
                    <th className="pb-2 pr-4">ET</th>
                    <th className="pb-2 pr-4">Pen</th>
                    <th className="pb-2 text-gold">Pts</th>
                    {result && <th className="pb-2 text-white/50">Breakdown</th>}
                  </tr>
                </thead>
                <tbody>
                  {fixtureOrder.map(name => {
                    const pred = preds.find(p => p.userName === name);
                    if (!pred) {
                      return (
                        <tr key={name} className="border-t border-white/10">
                          <td className="py-3 pr-4 font-semibold">{name}</td>
                          <td className="py-3 text-white/40" colSpan={7}>Forfeited</td>
                        </tr>
                      );
                    }
                    let pts = null;
                    let breakdown = null;
                    if (result) {
                      const fixture2 = {
                        id: fixture.id,
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
                      };
                      const s = scorePrediction({
                        homeScore: pred.homeScore,
                        awayScore: pred.awayScore,
                        possession: pred.possession as 'HOME' | 'AWAY' | 'EQUAL' | undefined,
                        firstGoalscorerId: pred.firstGoalscorer ?? null,
                        homeScoreExtraTime: pred.homeScoreExtraTime ?? null,
                        awayScoreExtraTime: pred.awayScoreExtraTime ?? null,
                        homePenaltyScore: pred.homePenaltyScore ?? null,
                        awayPenaltyScore: pred.awayPenaltyScore ?? null,
                      }, fixture2);
                      pts = s.totalPoints;
                      breakdown = [
                        `Outcome ${s.outcomePoints}/1`,
                        `Score ${s.exactScorePoints}/2`,
                        ...(pred.possession ? [`Poss ${s.possessionPoints}/1`] : []),
                        ...(pred.firstGoalscorer ? [`Scorer ${s.firstGoalscorerPoints}/1`] : []),
                        ...(result.homeScoreExtraTime != null ? [`ET ${s.extraTimePoints}/1`] : []),
                        ...(result.homePenaltyScore != null ? [`Pen ${s.penaltyPoints}/1`] : []),
                      ].join(', ');
                    }
                    const possLabel = pred.possession === 'HOME' ? fixture.homeTeam.name : pred.possession === 'AWAY' ? fixture.awayTeam.name : pred.possession === 'EQUAL' ? 'Equal' : '—';
                    return (
                      <tr key={name} className="border-t border-white/10">
                        <td className="py-3 pr-4 font-semibold">{name}</td>
                        <td className="py-3 pr-4">{pred.homeScore}–{pred.awayScore}</td>
                        <td className="py-3 pr-4">{possLabel}</td>
                        <td className="py-3 pr-4">{pred.firstGoalscorer ?? '—'}</td>
                        <td className="py-3 pr-4">
                          {pred.homeScoreExtraTime != null ? `${pred.homeScoreExtraTime}–${pred.awayScoreExtraTime}` : '—'}
                        </td>
                        <td className="py-3 pr-4">
                          {pred.homePenaltyScore != null ? `${pred.homePenaltyScore}–${pred.awayPenaltyScore}` : '—'}
                        </td>
                        <td className="py-3 pr-4 text-gold font-bold">{pts ?? '—'}</td>
                        {result && <td className="py-3 text-white/40 text-xs">{breakdown}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-white/50 text-sm">
              Predictions are hidden until all players submit or the match starts.
            </p>
          )}
        </div>

        {/* Result entry form */}
        {showResultForm && !result && (
          <div className="glass rounded-3xl p-6 border border-flood/30">
            <h2 className="text-xl font-bold mb-4 text-flood">Enter Official Result</h2>
            <div className="space-y-4">
              <div className="rounded-2xl bg-black/25 p-4">
                <p className="text-sm text-white/60 mb-3">90-minute score</p>
                <div className="flex items-center justify-around gap-4">
                  <ScoreInput value={rHome90} onChange={setRHome90} label={fixture.homeTeam.name} />
                  <span className="text-2xl text-white/40 font-black mt-4">—</span>
                  <ScoreInput value={rAway90} onChange={setRAway90} label={fixture.awayTeam.name} />
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">
                  {fixture.homeTeam.name} possession: <span className="text-white">{rHomePoss}%</span> — {fixture.awayTeam.name}: {100 - rHomePoss}%
                </label>
                <input type="range" min={0} max={100} value={rHomePoss}
                  onChange={e => setRHomePoss(Number(e.target.value))}
                  className="w-full accent-flood" />
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">First goalscorer:</label>
                <select value={rFirstScorer} onChange={e => setRFirstScorer(e.target.value)}
                  className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white">
                  <option value="">None / No goal scored</option>
                  <optgroup label={`── ${fixture.homeTeam.name} ──`}>
                    {homeSquad.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                  <optgroup label={`── ${fixture.awayTeam.name} ──`}>
                    {awaySquad.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                </select>
              </div>

              <div className="rounded-2xl bg-black/25 p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={rHasET} onChange={e => setRHasET(e.target.checked)} className="w-4 h-4 accent-flood" />
                  <span className="text-sm">Extra time played?</span>
                </label>
                {rHasET && (
                  <div className="flex items-center justify-around gap-4 pt-2">
                    <ScoreInput value={rHomeET} onChange={setRHomeET} label={`ET ${fixture.homeTeam.name}`} />
                    <span className="text-2xl text-white/40 font-black mt-4">—</span>
                    <ScoreInput value={rAwayET} onChange={setRAwayET} label={`ET ${fixture.awayTeam.name}`} />
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-black/25 p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={rHasPenalties} onChange={e => setRHasPenalties(e.target.checked)} className="w-4 h-4 accent-flood" />
                  <span className="text-sm">Penalties?</span>
                </label>
                {rHasPenalties && (
                  <div className="flex items-center justify-around gap-4 pt-2">
                    <ScoreInput value={rHomePenalty} onChange={setRHomePenalty} label={`Pen ${fixture.homeTeam.name}`} />
                    <span className="text-2xl text-white/40 font-black mt-4">—</span>
                    <ScoreInput value={rAwayPenalty} onChange={setRAwayPenalty} label={`Pen ${fixture.awayTeam.name}`} />
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveResult}
                  disabled={savingResult}
                  className="flex-1 rounded-full bg-flood text-pitch font-bold py-3 hover:opacity-90 disabled:opacity-50"
                >
                  {savingResult ? 'Saving…' : 'Save Official Result'}
                </button>
                <button onClick={() => setShowResultForm(false)}
                  className="rounded-full px-6 py-3 bg-white/10 hover:bg-white/20">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Enter result button (when result exists, show edit) */}
        {result && isLocked && (
          <div className="text-center">
            <button onClick={() => setShowResultForm(v => !v)} className="text-sm text-white/40 underline hover:text-white/70">
              {showResultForm ? 'Cancel edit' : 'Edit result'}
            </button>
          </div>
        )}

        {result && showResultForm && (
          <div className="glass rounded-3xl p-6 border border-flood/30">
            <h2 className="text-xl font-bold mb-4 text-flood">Edit Official Result</h2>
            <p className="text-sm text-white/50 mb-4">Saving will overwrite the existing result and recalculate all points.</p>
            <div className="space-y-4">
              <div className="rounded-2xl bg-black/25 p-4">
                <p className="text-sm text-white/60 mb-3">90-minute score</p>
                <div className="flex items-center justify-around gap-4">
                  <ScoreInput value={rHome90} onChange={setRHome90} label={fixture.homeTeam.name} />
                  <span className="text-2xl text-white/40 font-black mt-4">—</span>
                  <ScoreInput value={rAway90} onChange={setRAway90} label={fixture.awayTeam.name} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">
                  {fixture.homeTeam.name} possession: {rHomePoss}% — {fixture.awayTeam.name}: {100 - rHomePoss}%
                </label>
                <input type="range" min={0} max={100} value={rHomePoss}
                  onChange={e => setRHomePoss(Number(e.target.value))} className="w-full accent-flood" />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">First goalscorer:</label>
                <select value={rFirstScorer} onChange={e => setRFirstScorer(e.target.value)}
                  className="w-full rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white">
                  <option value="">None</option>
                  <optgroup label={`── ${fixture.homeTeam.name} ──`}>
                    {homeSquad.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                  <optgroup label={`── ${fixture.awayTeam.name} ──`}>
                    {awaySquad.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                </select>
              </div>
              <button onClick={handleSaveResult} disabled={savingResult}
                className="w-full rounded-full bg-flood text-pitch font-bold py-3 hover:opacity-90 disabled:opacity-50">
                {savingResult ? 'Saving…' : 'Update Result'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
