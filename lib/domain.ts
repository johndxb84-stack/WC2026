import { customFixtureOrder } from './fixture-overrides';

export const defaultPlayerOrder = ['Anthony', 'Nicolas', 'Jean'] as const;
export const referenceRotationDate = '2026-06-15';
export type Outcome = 'HOME' | 'AWAY' | 'DRAW';
export type PossessionPick = 'HOME' | 'AWAY' | 'EQUAL';
export type PredictionInput = { userName: string; homeScore: number; awayScore: number; submittedAt: Date };
export type PredictionRecord = PredictionInput & { forfeited?: boolean };
export type FixtureLike = { id: string; kickoff: Date; started?: boolean; homeScore90?: number; awayScore90?: number; homePossession?: number; awayPossession?: number; firstGoalscorerId?: string | null; homeScoreExtraTime?: number | null; awayScoreExtraTime?: number | null; homePenaltyScore?: number | null; awayPenaltyScore?: number | null; settled?: boolean };

// The rewards were upgraded — all point values doubled — starting with the games from 1 July 2026.
// Matches that kicked off before this keep their original (single) point values, so past scores never change.
export const NEW_POINTS_FROM = new Date('2026-07-01T12:00:00Z');
export function pointMultiplier(kickoff?: Date | null): number {
  return kickoff && kickoff.getTime() >= NEW_POINTS_FROM.getTime() ? 2 : 1;
}

export function dateKeyInTimezone(date: Date, timeZone = 'Asia/Dubai') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function dailyOrder(_date?: Date, playerOrder = [...defaultPlayerOrder]) {
  return [...playerOrder];
}

// 3-day rotation starting June 18, 2026, keyed to the venue's local date
// Day 0 (June 18 local): Nicolas → Jean → Anthony
// Day 1 (June 19 local): Jean → Anthony → Nicolas
// Day 2 (June 20 local): Anthony → Nicolas → Jean
const ROTATION: readonly string[][] = [
  ['Nicolas', 'Jean', 'Anthony'],
  ['Jean', 'Anthony', 'Nicolas'],
  ['Anthony', 'Nicolas', 'Jean'],
];
const ROTATION_REFERENCE = '2026-06-18'; // day 0

const VENUE_TIMEZONE: [string, string][] = [
  ['New York', 'America/New_York'],
  ['New Jersey', 'America/New_York'],
  ['Philadelphia', 'America/New_York'],
  ['Boston', 'America/New_York'],
  ['Miami', 'America/New_York'],
  ['Atlanta', 'America/New_York'],
  ['Toronto', 'America/Toronto'],
  ['Dallas', 'America/Chicago'],
  ['Houston', 'America/Chicago'],
  ['Kansas City', 'America/Chicago'],
  ['Chicago', 'America/Chicago'],
  ['Vancouver', 'America/Vancouver'],
  ['Los Angeles', 'America/Los_Angeles'],
  ['San Francisco', 'America/Los_Angeles'],
  ['Seattle', 'America/Los_Angeles'],
  ['Mexico City', 'America/Mexico_City'],
  ['Guadalajara', 'America/Mexico_City'],
  ['Monterrey', 'America/Monterrey'],
];

export function venueTimezone(venue: string | null): string {
  if (venue) {
    for (const [key, tz] of VENUE_TIMEZONE) {
      if (venue.includes(key)) return tz;
    }
  }
  return 'America/New_York'; // safe default — most WC 2026 games are Eastern
}

export function orderForVenueDate(kickoff: Date, venue: string | null): string[] {
  const tz = venueTimezone(venue);
  const localDateKey = dateKeyInTimezone(kickoff, tz);
  const refMs = new Date(ROTATION_REFERENCE).getTime();
  const localMs = new Date(localDateKey).getTime();
  const daysDiff = Math.round((localMs - refMs) / 86_400_000);
  const idx = ((daysDiff % 3) + 3) % 3;
  return [...ROTATION[idx]];
}

// From 11 July 2026 the betting order rotates per GAME, not per calendar day.
// The old daily rotation skipped rest days, so the same player could end up
// first on several consecutive matches (e.g. the last QF and the first semi).
export const PER_GAME_ROTATION_FROM = new Date('2026-07-11T00:00:00Z');
// Offset chosen so the games already bet on stay consistent (Anthony had already
// placed first bets on both 11-July quarter-finals) and the France v Spain semi
// lands on Nicolas — from there every game hands "first" to the next player.
const PER_GAME_ROTATION_START = 1;

// Order for a game under per-game rotation: its index is how many games (across
// the whole tournament schedule) kick off between the cutoff and this game.
export function perGameRotationOrder(kickoff: Date, allKickoffs: Date[]): string[] {
  const idx = allKickoffs.filter(
    k => k.getTime() >= PER_GAME_ROTATION_FROM.getTime() && k.getTime() < kickoff.getTime(),
  ).length;
  return [...ROTATION[(PER_GAME_ROTATION_START + idx) % 3]];
}

// Use this everywhere instead of calling orderForVenueDate directly.
// Priority: hardcoded per-match override → per-game rotation (games from 11 July,
// when the caller can supply the full kickoff schedule) → daily venue-date rotation.
export function fixtureOrder(
  kickoff: Date,
  venue: string | null,
  homeTeam: string,
  awayTeam: string,
  allKickoffs?: Date[],
): string[] {
  const custom = customFixtureOrder(homeTeam, awayTeam);
  if (custom) return custom;
  if (allKickoffs && kickoff.getTime() >= PER_GAME_ROTATION_FROM.getTime()) {
    return perGameRotationOrder(kickoff, allKickoffs);
  }
  return orderForVenueDate(kickoff, venue);
}

export function outcome(home: number, away: number): Outcome { return home > away ? 'HOME' : away > home ? 'AWAY' : 'DRAW'; }
// The winner of the match using the most decisive result available: penalties, then extra time, then 90'.
// Used for the outcome point so that correctly calling the eventual winner counts, even if the match was
// settled in ET/penalties (90' draw) or the predictor expected ET but it finished in regulation.
export function finalWinner(
  home90: number, away90: number,
  homeET?: number | null, awayET?: number | null,
  homePen?: number | null, awayPen?: number | null,
): Outcome {
  if (homePen != null && awayPen != null && homePen !== awayPen) return homePen > awayPen ? 'HOME' : 'AWAY';
  if (homeET != null && awayET != null) return outcome(homeET, awayET);
  return outcome(home90, away90);
}
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
  const predWinner = finalWinner(pred.homeScore, pred.awayScore, pred.homeScoreExtraTime, pred.awayScoreExtraTime, pred.homePenaltyScore, pred.awayPenaltyScore);
  const actualWinner = finalWinner(fixture.homeScore90, fixture.awayScore90, fixture.homeScoreExtraTime, fixture.awayScoreExtraTime, fixture.homePenaltyScore, fixture.awayPenaltyScore);
  // Point values double for games from NEW_POINTS_FROM onward; earlier games keep their original values.
  const m = pointMultiplier(fixture.kickoff);
  const outcomePoints = (predWinner === actualWinner ? 1 : 0) * m;
  // The predicted scoreline earns exact-score points if it matches the 90' score
  // OR, when the game went to extra time, the final after-ET score — calling the
  // final scoreline of an ET game is at least as hard as calling the 90' one.
  const matches90 = pred.homeScore === fixture.homeScore90 && pred.awayScore === fixture.awayScore90;
  const matchesET = fixture.homeScoreExtraTime != null && fixture.awayScoreExtraTime != null
    && pred.homeScore === fixture.homeScoreExtraTime && pred.awayScore === fixture.awayScoreExtraTime;
  const exactScorePoints = (matches90 || matchesET ? 2 : 0) * m;
  const actualPossession = fixture.homePossession == null || fixture.awayPossession == null ? undefined : fixture.homePossession === fixture.awayPossession ? 'EQUAL' : fixture.homePossession > fixture.awayPossession ? 'HOME' : 'AWAY';
  const possessionPoints = (pred.possession && actualPossession && pred.possession === actualPossession ? 1 : 0) * m;
  const firstGoalscorerPoints = (pred.firstGoalscorerId !== undefined && pred.firstGoalscorerId === (fixture.firstGoalscorerId ?? null) ? 1 : 0) * m;
  // Correctly calling that the match goes the distance, regardless of the ET/penalty score itself.
  const reachedExtraTimePoints = (pred.homeScoreExtraTime != null && pred.awayScoreExtraTime != null && fixture.homeScoreExtraTime != null ? 1 : 0) * m;
  const extraTimePoints = (fixture.homeScoreExtraTime != null && pred.homeScoreExtraTime === fixture.homeScoreExtraTime && pred.awayScoreExtraTime === fixture.awayScoreExtraTime ? 1 : 0) * m;
  const reachedPenaltiesPoints = (pred.homePenaltyScore != null && pred.awayPenaltyScore != null && fixture.homePenaltyScore != null ? 1 : 0) * m;
  const penaltyPoints = (fixture.homePenaltyScore != null && pred.homePenaltyScore === fixture.homePenaltyScore && pred.awayPenaltyScore === fixture.awayPenaltyScore ? 1 : 0) * m;
  return { outcomePoints, exactScorePoints, possessionPoints, firstGoalscorerPoints, reachedExtraTimePoints, extraTimePoints, reachedPenaltiesPoints, penaltyPoints, multiplier: m, totalPoints: outcomePoints + exactScorePoints + possessionPoints + firstGoalscorerPoints + reachedExtraTimePoints + extraTimePoints + reachedPenaltiesPoints + penaltyPoints };
}
