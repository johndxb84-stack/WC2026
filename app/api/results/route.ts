import { NextResponse } from 'next/server';
import { z } from 'zod';
import { scorePrediction } from '@/lib/domain';
import { redisCommand, redisLastError, redisPersistenceConfigured } from '@/lib/redis-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resultsStoreKey = 'wc2026:results:v1';

type StoredPrediction = {
  fixtureId: string;
  userName: string;
  homeScore: number;
  awayScore: number;
  possession?: 'NA' | 'HOME' | 'AWAY' | 'EQUAL';
  firstGoalscorer?: string;
  extraTimeApplicable?: boolean;
  homeScoreExtraTime?: number;
  awayScoreExtraTime?: number;
  penaltiesApplicable?: boolean;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
};

type StoredResult = {
  fixtureId: string;
  homeScore90: number;
  awayScore90: number;
  homePossession?: number;
  awayPossession?: number;
  firstGoalscorerId?: string | null;
  homeScoreExtraTime?: number | null;
  awayScoreExtraTime?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  confirmedAt: string;
};

type StoredScore = ReturnType<typeof scorePrediction> & { fixtureId: string; userName: string };
type ResultsState = { results: StoredResult[]; scores: StoredScore[]; updatedAt: string | null };
const manualResultOverrides: StoredResult[] = [
  {
    fixtureId: 'match-14',
    homeScore90: 0,
    awayScore90: 0,
    homePossession: 51,
    awayPossession: 49,
    firstGoalscorerId: null,
    homeScoreExtraTime: null,
    awayScoreExtraTime: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    confirmedAt: '2026-06-15T17:45:00.000Z',
  },
  {
    fixtureId: 'match-16',
    homeScore90: 1,
    awayScore90: 1,
    homePossession: 51,
    awayPossession: 49,
    firstGoalscorerId: 'Emam Ashour',
    homeScoreExtraTime: null,
    awayScoreExtraTime: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    confirmedAt: '2026-06-16T08:00:00.000Z',
  },
  {
    fixtureId: 'match-13',
    homeScore90: 1,
    awayScore90: 1,
    homePossession: 49,
    awayPossession: 51,
    firstGoalscorerId: 'Abdulelah Al-Malki',
    homeScoreExtraTime: null,
    awayScoreExtraTime: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    confirmedAt: '2026-06-16T08:00:00.000Z',
  },
  {
    fixtureId: 'match-15',
    homeScore90: 2,
    awayScore90: 2,
    homePossession: 49,
    awayPossession: 51,
    firstGoalscorerId: 'Elijah Just',
    homeScoreExtraTime: null,
    awayScoreExtraTime: null,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    confirmedAt: '2026-06-16T08:00:00.000Z',
  },
];
const resultSchema = z.object({
  fixtureId: z.string(),
  homeScore90: z.number().int().min(0),
  awayScore90: z.number().int().min(0),
  homePossession: z.number().int().min(0).max(100).optional(),
  awayPossession: z.number().int().min(0).max(100).optional(),
  firstGoalscorerId: z.string().nullable().optional(),
  homeScoreExtraTime: z.number().int().min(0).nullable().optional(),
  awayScoreExtraTime: z.number().int().min(0).nullable().optional(),
  homePenaltyScore: z.number().int().min(0).nullable().optional(),
  awayPenaltyScore: z.number().int().min(0).nullable().optional(),
});

const memoryStore = globalThis as typeof globalThis & { wc2026ResultsState?: ResultsState };

function emptyState(): ResultsState {
  return { results: [], scores: [], updatedAt: null };
}

async function readState(): Promise<ResultsState> {
  try {
    const remote = await redisCommand<string>(['GET', resultsStoreKey]);
    if (remote) return JSON.parse(remote) as ResultsState;
  } catch {
    // Fall back to temporary memory so the API stays online and can report the Redis problem.
  }
  return memoryStore.wc2026ResultsState ?? emptyState();
}

async function writeState(state: ResultsState) {
  try {
    const remote = await redisCommand<string>(['SET', resultsStoreKey, JSON.stringify(state)]);
    if (remote === null) memoryStore.wc2026ResultsState = state;
  } catch {
    memoryStore.wc2026ResultsState = state;
  }
}

function leaderboard(scores: StoredScore[]) {
  const rows = new Map<string, { userName: string; totalPoints: number; matchesSettled: number; exactScores: number; correctOutcomes: number; extraPoints: number }>();

  for (const score of scores) {
    const row = rows.get(score.userName) ?? { userName: score.userName, totalPoints: 0, matchesSettled: 0, exactScores: 0, correctOutcomes: 0, extraPoints: 0 };
    row.totalPoints += score.totalPoints;
    row.matchesSettled += 1;
    row.exactScores += score.exactScorePoints > 0 ? 1 : 0;
    row.correctOutcomes += score.outcomePoints > 0 ? 1 : 0;
    row.extraPoints += score.possessionPoints + score.firstGoalscorerPoints + score.extraTimePoints + score.penaltyPoints;
    rows.set(score.userName, row);
  }

  return [...rows.values()].sort((a, b) => b.totalPoints - a.totalPoints || a.userName.localeCompare(b.userName));
}

async function currentPredictions(origin: string): Promise<StoredPrediction[]> {
  const response = await fetch(`${origin}/api/predictions`, { cache: 'no-store' });
  if (!response.ok) return [];
  const payload = await response.json() as { predictions?: StoredPrediction[] };
  return payload.predictions ?? [];
}

function scoreFixture(result: StoredResult, predictions: StoredPrediction[]): StoredScore[] {
  return predictions.filter((prediction) => prediction.fixtureId === result.fixtureId).map((prediction) => {
    const calculated = scorePrediction({
      homeScore: Number(prediction.homeScore),
      awayScore: Number(prediction.awayScore),
      possession: prediction.possession === 'NA' ? undefined : prediction.possession,
      firstGoalscorerId: prediction.firstGoalscorer === 'NA' ? undefined : prediction.firstGoalscorer,
      homeScoreExtraTime: prediction.homeScoreExtraTime,
      awayScoreExtraTime: prediction.awayScoreExtraTime,
      homePenaltyScore: prediction.homePenaltyScore,
      awayPenaltyScore: prediction.awayPenaltyScore,
    }, { id: result.fixtureId, kickoff: new Date(result.confirmedAt), ...result });

    return {
      fixtureId: result.fixtureId,
      userName: prediction.userName,
      ...calculated,
    };
  });
}

function applyManualResults(state: ResultsState, predictions: StoredPrediction[]): ResultsState {
  const results = [...state.results];
  const scores = [...state.scores];

  for (const result of manualResultOverrides) {
    const index = results.findIndex((candidate) => candidate.fixtureId === result.fixtureId);
    if (index === -1) results.push(result);
    else results[index] = result;

    const replacementScores = scoreFixture(result, predictions);
    scores.splice(0, scores.length, ...scores.filter((candidate) => candidate.fixtureId !== result.fixtureId), ...replacementScores);
  }

  return { results, scores, updatedAt: state.updatedAt ?? manualResultOverrides.at(-1)?.confirmedAt ?? null };
}

export async function GET(request: Request) {
  const state = await readState();
  const predictions = await currentPredictions(new URL(request.url).origin);
  const effectiveState = applyManualResults(state, predictions);
  if (JSON.stringify(effectiveState) !== JSON.stringify(state)) await writeState(effectiveState);
  return NextResponse.json({ ...effectiveState, leaderboard: leaderboard(effectiveState.scores), persistence: redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory' });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json();
  const result = { ...resultSchema.parse(body.fixture ?? body), confirmedAt: new Date().toISOString() } satisfies StoredResult;
  const predictions = (body.predictions as StoredPrediction[] | undefined) ?? await currentPredictions(url.origin);
  const resultScores = scoreFixture(result, predictions);

  const state = await readState();
  const results = [...state.results.filter((candidate) => candidate.fixtureId !== result.fixtureId), result];
  const scores = [...state.scores.filter((candidate) => candidate.fixtureId !== result.fixtureId), ...resultScores];
  const nextState = { results, scores, updatedAt: new Date().toISOString() };
  await writeState(nextState);

  return NextResponse.json({ ok: true, ...nextState, leaderboard: leaderboard(scores), persistence: redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory' });
}
