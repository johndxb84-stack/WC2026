'use client';

import { useMemo, useState } from 'react';
import { currentEligiblePlayer, shouldReveal, validatePrediction, type PredictionRecord } from '@/lib/domain';

type Fixture = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  homeSquad: string[];
  awaySquad: string[];
  goalscorerOptions: string[];
};

type OptionalPick = 'NA' | 'HOME' | 'AWAY' | 'EQUAL';

type ExtendedPrediction = PredictionRecord & {
  possession: OptionalPick;
  firstGoalscorer: string;
  extraTimeApplicable: boolean;
  homeScoreExtraTime?: number;
  awayScoreExtraTime?: number;
  penaltiesApplicable: boolean;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
};

const emptyScore = { home: 0, away: 0 };

export function PredictionCard({ fixture, order, initialPredictions }: { fixture: Fixture; order: string[]; initialPredictions: PredictionRecord[] }) {
  const [predictions, setPredictions] = useState<ExtendedPrediction[]>(
    initialPredictions.map((prediction) => ({
      ...prediction,
      possession: 'NA',
      firstGoalscorer: 'NA',
      extraTimeApplicable: false,
      penaltiesApplicable: false,
    })),
  );
  const [homeScore, setHomeScore] = useState(emptyScore.home);
  const [awayScore, setAwayScore] = useState(emptyScore.away);
  const [possession, setPossession] = useState<OptionalPick>('NA');
  const [firstGoalscorer, setFirstGoalscorer] = useState('NA');
  const [extraTimeApplicable, setExtraTimeApplicable] = useState(false);
  const [homeScoreExtraTime, setHomeScoreExtraTime] = useState(0);
  const [awayScoreExtraTime, setAwayScoreExtraTime] = useState(0);
  const [penaltiesApplicable, setPenaltiesApplicable] = useState(false);
  const [homePenaltyScore, setHomePenaltyScore] = useState(0);
  const [awayPenaltyScore, setAwayPenaltyScore] = useState(0);
  const [message, setMessage] = useState('');

  const currentPlayer = currentEligiblePlayer(order, predictions);
  const reveal = shouldReveal(order, predictions, { id: fixture.id, kickoff: fixture.kickoff });
  const takenScores = useMemo(() => new Set(predictions.filter((prediction) => !prediction.forfeited).map((prediction) => `${prediction.homeScore}-${prediction.awayScore}`)), [predictions]);

  function submitPrediction() {
    if (!currentPlayer) {
      setMessage('All players have already submitted or forfeited for this match.');
      return;
    }

    const submittedAt = new Date('2026-06-15T10:00:00+04:00');
    const validation = validatePrediction(
      { id: fixture.id, kickoff: fixture.kickoff },
      order,
      predictions,
      { userName: currentPlayer, homeScore, awayScore, submittedAt },
    );

    if (!validation.ok) {
      setMessage(validation.reason);
      return;
    }

    setPredictions((existing) => [
      ...existing,
      {
        userName: currentPlayer,
        homeScore,
        awayScore,
        submittedAt,
        possession,
        firstGoalscorer,
        extraTimeApplicable,
        homeScoreExtraTime: extraTimeApplicable ? homeScoreExtraTime : undefined,
        awayScoreExtraTime: extraTimeApplicable ? awayScoreExtraTime : undefined,
        penaltiesApplicable,
        homePenaltyScore: penaltiesApplicable ? homePenaltyScore : undefined,
        awayPenaltyScore: penaltiesApplicable ? awayPenaltyScore : undefined,
      },
    ]);
    setMessage(`${currentPlayer} submitted ${homeScore}-${awayScore}. Next player can now bet.`);
    setHomeScore(0);
    setAwayScore(0);
    setPossession('NA');
    setFirstGoalscorer('NA');
    setExtraTimeApplicable(false);
    setPenaltiesApplicable(false);
  }

  return (
    <section className="mt-5 rounded-2xl border border-flood/30 bg-black/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-flood">Betting slip</p>
          <h3 className="text-xl font-black">{currentPlayer ? `${currentPlayer}'s turn` : 'Betting complete'}</h3>
        </div>
        <p className="rounded-full bg-white/10 px-3 py-1 text-sm">Unique score required per match</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm text-white/70">{fixture.homeTeam} 90-min goals</span>
          <input className="w-full rounded-xl bg-white/10 p-3" min={0} type="number" value={homeScore} onChange={(event) => setHomeScore(Number(event.target.value))} />
        </label>
        <label className="space-y-1">
          <span className="text-sm text-white/70">{fixture.awayTeam} 90-min goals</span>
          <input className="w-full rounded-xl bg-white/10 p-3" min={0} type="number" value={awayScore} onChange={(event) => setAwayScore(Number(event.target.value))} />
        </label>
      </div>

      {takenScores.has(`${homeScore}-${awayScore}`) ? <p className="mt-2 text-sm text-gold">This score has already been selected. Please choose another score.</p> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm text-white/70">Higher possession (+1)</span>
          <select className="w-full rounded-xl bg-white/10 p-3" value={possession} onChange={(event) => setPossession(event.target.value as OptionalPick)}>
            <option value="NA">N/A - no possession bet</option>
            <option value="HOME">{fixture.homeTeam}</option>
            <option value="AWAY">{fixture.awayTeam}</option>
            <option value="EQUAL">Equal possession</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm text-white/70">First goalscorer (+1)</span>
          <select className="w-full rounded-xl bg-white/10 p-3" value={firstGoalscorer} onChange={(event) => setFirstGoalscorer(event.target.value)}>
            <option value="NA">N/A - no first scorer bet</option>
            <option value="NO_GOALSCORER">No goalscorer</option>
            <option value="OWN_GOAL">Own goal</option>
            <optgroup label={fixture.homeTeam}>
              {fixture.homeSquad.map((player) => <option key={`${fixture.homeTeam}-${player}`} value={player}>{player}</option>)}
            </optgroup>
            <optgroup label={fixture.awayTeam}>
              {fixture.awaySquad.map((player) => <option key={`${fixture.awayTeam}-${player}`} value={player}>{player}</option>)}
            </optgroup>
            <option value="MANUAL">Player not listed / manual selection</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white/5 p-3">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={extraTimeApplicable} onChange={(event) => setExtraTimeApplicable(event.target.checked)} />
            Extra time applicable? Otherwise N/A.
          </label>
          {extraTimeApplicable ? <div className="mt-3 grid grid-cols-2 gap-2"><input className="rounded-xl bg-white/10 p-3" min={0} type="number" value={homeScoreExtraTime} onChange={(event) => setHomeScoreExtraTime(Number(event.target.value))} /><input className="rounded-xl bg-white/10 p-3" min={0} type="number" value={awayScoreExtraTime} onChange={(event) => setAwayScoreExtraTime(Number(event.target.value))} /></div> : null}
        </div>
        <div className="rounded-2xl bg-white/5 p-3">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={penaltiesApplicable} onChange={(event) => setPenaltiesApplicable(event.target.checked)} />
            Penalties applicable? Otherwise N/A.
          </label>
          {penaltiesApplicable ? <div className="mt-3 grid grid-cols-2 gap-2"><input className="rounded-xl bg-white/10 p-3" min={0} type="number" value={homePenaltyScore} onChange={(event) => setHomePenaltyScore(Number(event.target.value))} /><input className="rounded-xl bg-white/10 p-3" min={0} type="number" value={awayPenaltyScore} onChange={(event) => setAwayPenaltyScore(Number(event.target.value))} /></div> : null}
        </div>
      </div>

      <button className="mt-4 rounded-full bg-gold px-5 py-3 font-black text-pitch disabled:opacity-50" disabled={!currentPlayer || takenScores.has(`${homeScore}-${awayScore}`)} onClick={submitPrediction} type="button">
        Bet for {currentPlayer ?? 'all players'}
      </button>
      {message ? <p className="mt-3 text-sm text-white/80">{message}</p> : null}

      <div className="mt-4 rounded-2xl bg-white/5 p-3 text-sm text-white/75">
        <p><b>Points:</b> 1 result, 2 exact 90-min score, +1 possession, +1 first goalscorer, +1 exact extra-time score, +1 exact penalty score.</p>
        <p>Extra time and penalties can be marked N/A when you believe they will not apply.</p>
      </div>

      {reveal ? <div className="mt-4 space-y-2"><h4 className="font-bold">Revealed bets</h4>{predictions.map((prediction) => <p key={prediction.userName}>{prediction.userName}: {prediction.homeScore}-{prediction.awayScore}</p>)}</div> : null}
    </section>
  );
}
