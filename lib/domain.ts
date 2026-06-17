export const defaultPlayerOrder = ['Anthony', 'Nicolas', 'Jean'] as const;
export const referenceRotationDate = '2026-06-15';
export type Outcome = 'HOME' | 'AWAY' | 'DRAW';
export type PossessionPick = 'HOME' | 'AWAY' | 'EQUAL';
export type PredictionInput = { userName: string; homeScore: number; awayScore: number; submittedAt: Date };
export type PredictionRecord = PredictionInput & { forfeited?: boolean };
export type FixtureLike = { id: string; kickoff: Date; started?: boolean; homeScore90?: number; awayScore90?: number; homePossession?: number; awayPossession?: number; firstGoalscorerId?: string | null; homeScoreExtraTime?: number | null; awayScoreExtraTime?: number | null; homePenaltyScore?: number | null; awayPenaltyScore?: number | null; settled?: boolean };

export function dateKeyInTimezone(date: Date, timeZone = 'Asia/Dubai') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function dailyOrder(_date?: Date, playerOrder = [...defaultPlayerOrder]) {
  return [...playerOrder];
}
export function outcome(home: number, away: number): Outcome { return home > away ? 'HOME' : away > home ? 'AWAY' : 'DRAW'; }
export function isLocked(fixture: FixtureLike, now = new Date()) { return Boolean(fixture.started) || now >= fixture.kickoff; }
export function currentEligiblePlayer(order: string[], predictions: PredictionRecord[]) {
  for (const name of order) if (!predictions.some(p => p.userName === name && (p.submittedAt || p.forfeited))) return name;
  return null;
}
export function validatePrediction(fixture: FixtureLike, order: string[], existing: PredictionRecord[], input: PredictionInput) {
  if (isLocked(fixture, input.submittedAt)) return { ok: false, reason: 'Predictions are locked for this match.' } as const;
  if (existing.some(p => p.userName === input.userName && !p.forfeited)) return { ok: false, reason: 'Player already submitted.' } as const;
  if (currentEligiblePlayer(order, existing) !== input.userName) return { ok: false, reason: 'It is not this player’s turn.' } as const;
  if (existing.some(p => !p.forfeited && p.homeScore === input.homeScore && p.awayScore === input.awayScore)) return { ok: false, reason: 'This score has already been selected. Please choose another score.' } as const;
  if (input.homeScore < 0 || input.awayScore < 0) return { ok: false, reason: 'Scores must be positive.' } as const;
  return { ok: true } as const;
}
export function shouldReveal(order: string[], predictions: PredictionRecord[], fixture: FixtureLike, now = new Date()) {
  return isLocked(fixture, now) || order.every(name => predictions.some(p => p.userName === name && (p.submittedAt || p.forfeited)));
}
export function scorePrediction(pred: {homeScore:number; awayScore:number; possession?:PossessionPick; firstGoalscorerId?:string|null; homeScoreExtraTime?:number|null; awayScoreExtraTime?:number|null; homePenaltyScore?:number|null; awayPenaltyScore?:number|null}, fixture: Required<Pick<FixtureLike,'homeScore90'|'awayScore90'>> & FixtureLike) {
  const outcomePoints = outcome(pred.homeScore, pred.awayScore) === outcome(fixture.homeScore90, fixture.awayScore90) ? 1 : 0;
  const exactScorePoints = pred.homeScore === fixture.homeScore90 && pred.awayScore === fixture.awayScore90 ? 2 : 0;
  const actualPossession = fixture.homePossession == null || fixture.awayPossession == null ? undefined : fixture.homePossession === fixture.awayPossession ? 'EQUAL' : fixture.homePossession > fixture.awayPossession ? 'HOME' : 'AWAY';
  const possessionPoints = pred.possession && actualPossession && pred.possession === actualPossession ? 1 : 0;
  const firstGoalscorerPoints = pred.firstGoalscorerId !== undefined && pred.firstGoalscorerId === (fixture.firstGoalscorerId ?? null) ? 1 : 0;
  const extraTimePoints = fixture.homeScoreExtraTime != null && pred.homeScoreExtraTime === fixture.homeScoreExtraTime && pred.awayScoreExtraTime === fixture.awayScoreExtraTime ? 1 : 0;
  const penaltyPoints = fixture.homePenaltyScore != null && pred.homePenaltyScore === fixture.homePenaltyScore && pred.awayPenaltyScore === fixture.awayPenaltyScore ? 1 : 0;
  return { outcomePoints, exactScorePoints, possessionPoints, firstGoalscorerPoints, extraTimePoints, penaltyPoints, totalPoints: outcomePoints + exactScorePoints + possessionPoints + firstGoalscorerPoints + extraTimePoints + penaltyPoints };
}
