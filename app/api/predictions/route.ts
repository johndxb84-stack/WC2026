import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fixtures as mockFixtures, players as mockPlayers } from '@/lib/mock-data';
import { redisCommand, redisPersistenceConfigured, redisLastError } from '@/lib/redis-store';
import { readResults } from '@/lib/results-store';
import { scorePrediction } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const storeKey = 'wc2026:predictions:v1';

type StoredPrediction = {
  fixtureId: string;
  userName: string;
  homeScore: number;
  awayScore: number;
  submittedAt: string;
  possession?: string;
  firstGoalscorer?: string;
  homeScoreExtraTime?: number | null;
  awayScoreExtraTime?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
};

type PredictionState = { predictions: StoredPrediction[]; resetAt: string | null };

const memoryStore = globalThis as typeof globalThis & { wc2026PredictionState?: PredictionState };

function parseState(raw: string | null): PredictionState {
  if (!raw) return memoryStore.wc2026PredictionState ?? { predictions: [], resetAt: null };
  const parsed = JSON.parse(raw) as PredictionState | StoredPrediction[];
  return Array.isArray(parsed)
    ? { predictions: parsed, resetAt: null }
    : { predictions: parsed.predictions ?? [], resetAt: parsed.resetAt ?? null };
}

async function readState(): Promise<PredictionState> {
  try {
    const remote = await redisCommand<string>(['GET', storeKey]);
    return parseState(remote);
  } catch {
    return parseState(null);
  }
}

async function writeState(state: PredictionState) {
  const serialized = JSON.stringify(state);
  try {
    const remote = await redisCommand<string>(['SET', storeKey, serialized]);
    if (remote === null) memoryStore.wc2026PredictionState = state;
  } catch {
    memoryStore.wc2026PredictionState = state;
  }
}

const optionalNumber = z.number().int().min(0).nullable().optional();

const predSchema = z.object({
  fixtureId: z.string(),
  userName: z.string(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  submittedAt: z.union([z.string(), z.date()]).transform((v: string | Date) => new Date(v).toISOString()).optional(),
  possession: z.string().optional(),
  firstGoalscorer: z.string().optional(),
  homeScoreExtraTime: optionalNumber,
  awayScoreExtraTime: optionalNumber,
  homePenaltyScore: optionalNumber,
  awayPenaltyScore: optionalNumber,
});

const bulkPredSchema = z.object({
  fixtureId: z.string(),
  userName: z.string(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  submittedAt: z.union([z.string(), z.date()]).transform((v: string | Date) => new Date(v).toISOString()),
  possession: z.string().optional(),
  firstGoalscorer: z.string().optional(),
  homeScoreExtraTime: optionalNumber,
  awayScoreExtraTime: optionalNumber,
  homePenaltyScore: optionalNumber,
  awayPenaltyScore: optionalNumber,
});

function toApiFixture(f: (typeof mockFixtures)[number]) {
  return {
    id: f.id,
    scheduledKickoff: f.kickoff.toISOString(),
    venue: f.venue,
    status: f.status,
    homeTeam: { name: f.homeTeam, shortName: null, logoUrl: null },
    awayTeam: { name: f.awayTeam, shortName: null, logoUrl: null },
  };
}

function toApiPrediction(p: StoredPrediction) {
  return {
    id: `${p.fixtureId}:${p.userName}`,
    fixtureId: p.fixtureId,
    user: { name: p.userName },
    predictedHomeScore90: p.homeScore,
    predictedAwayScore90: p.awayScore,
    possession: p.possession ?? null,
    firstGoalscorer: p.firstGoalscorer ?? null,
    homeScoreExtraTime: p.homeScoreExtraTime ?? null,
    awayScoreExtraTime: p.awayScoreExtraTime ?? null,
    homePenaltyScore: p.homePenaltyScore ?? null,
    awayPenaltyScore: p.awayPenaltyScore ?? null,
    submittedAt: p.submittedAt,
    status: 'SUBMITTED',
    score: null,
  };
}

function computePlayerPoints(
  predictions: StoredPrediction[],
  results: Awaited<ReturnType<typeof readResults>>,
) {
  const totals: Record<string, number> = {};
  for (const pred of predictions) {
    const res = results[pred.fixtureId];
    if (!res) continue;
    const fixture = {
      homeScore90: res.homeScore90,
      awayScore90: res.awayScore90,
      homePossession: res.homePossession,
      awayPossession: res.awayPossession,
      firstGoalscorerId: res.firstGoalscorer ?? null,
      homeScoreExtraTime: res.homeScoreExtraTime ?? null,
      awayScoreExtraTime: res.awayScoreExtraTime ?? null,
      homePenaltyScore: res.homePenaltyScore ?? null,
      awayPenaltyScore: res.awayPenaltyScore ?? null,
    };
    const predForScore = {
      homeScore: pred.homeScore,
      awayScore: pred.awayScore,
      possession: pred.possession as 'HOME' | 'AWAY' | 'EQUAL' | undefined,
      firstGoalscorerId: pred.firstGoalscorer ?? null,
      homeScoreExtraTime: pred.homeScoreExtraTime ?? null,
      awayScoreExtraTime: pred.awayScoreExtraTime ?? null,
      homePenaltyScore: pred.homePenaltyScore ?? null,
      awayPenaltyScore: pred.awayPenaltyScore ?? null,
    };
    const fixtureForScore = { id: pred.fixtureId, kickoff: new Date(0), ...fixture };
    const { totalPoints } = scorePrediction(predForScore, fixtureForScore);
    totals[pred.userName] = (totals[pred.userName] ?? 0) + totalPoints;
  }
  return totals;
}

export async function GET() {
  try {
    const [state, results] = await Promise.all([readState(), readResults()]);
    const persistence = redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory';
    const playerPoints = computePlayerPoints(state.predictions, results);
    return NextResponse.json({
      fixtures: mockFixtures.map(toApiFixture),
      predictions: state.predictions.map(toApiPrediction),
      players: mockPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        totalPoints: (playerPoints[p.name] ?? 0) + (p.basePoints ?? 0),
      })),
      results,
      persistence,
    });
  } catch (err) {
    console.error('GET /api/predictions failed:', err);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = predSchema.parse(await request.json());
    const state = await readState();

    const withoutExisting = state.predictions.filter(
      (p) => !(p.fixtureId === body.fixtureId && p.userName === body.userName),
    );

    const duplicate = withoutExisting.find(
      (p) => p.fixtureId === body.fixtureId && p.homeScore === body.homeScore && p.awayScore === body.awayScore,
    );
    if (duplicate) {
      return NextResponse.json({ ok: false, reason: 'This score has already been selected. Please choose another score.' }, { status: 409 });
    }

    const newPrediction: StoredPrediction = {
      fixtureId: body.fixtureId,
      userName: body.userName,
      homeScore: body.homeScore,
      awayScore: body.awayScore,
      submittedAt: body.submittedAt ?? new Date().toISOString(),
      possession: body.possession,
      firstGoalscorer: body.firstGoalscorer,
      homeScoreExtraTime: body.homeScoreExtraTime ?? null,
      awayScoreExtraTime: body.awayScoreExtraTime ?? null,
      homePenaltyScore: body.homePenaltyScore ?? null,
      awayPenaltyScore: body.awayPenaltyScore ?? null,
    };

    await writeState({ predictions: [...withoutExisting, newPrediction], resetAt: state.resetAt });

    return NextResponse.json({ ok: true, prediction: toApiPrediction(newPrediction) });
  } catch (err) {
    console.error('POST /api/predictions failed:', err);
    return NextResponse.json({ ok: false, reason: 'Server error.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = z.array(bulkPredSchema).parse(body.predictions ?? body);

    const state = await readState();

    const merged = new Map<string, StoredPrediction>();
    for (const pred of [...state.predictions, ...parsed]) {
      const key = `${pred.fixtureId}:${pred.userName}`;
      const existing = merged.get(key);
      if (!existing || new Date(pred.submittedAt).getTime() >= new Date(existing.submittedAt).getTime()) {
        merged.set(key, {
          fixtureId: pred.fixtureId,
          userName: pred.userName,
          homeScore: Number(pred.homeScore),
          awayScore: Number(pred.awayScore),
          submittedAt: pred.submittedAt,
          possession: pred.possession,
          firstGoalscorer: pred.firstGoalscorer,
          homeScoreExtraTime: pred.homeScoreExtraTime ?? null,
          awayScoreExtraTime: pred.awayScoreExtraTime ?? null,
          homePenaltyScore: pred.homePenaltyScore ?? null,
          awayPenaltyScore: pred.awayPenaltyScore ?? null,
        });
      }
    }

    const mergedArr = [...merged.values()];
    await writeState({ predictions: mergedArr, resetAt: state.resetAt });

    const persisted = await readState();
    const persistence = redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory';

    return NextResponse.json({
      ok: true,
      predictions: persisted.predictions.map(toApiPrediction),
      receivedCount: parsed.length,
      storedCount: persisted.predictions.length,
      persistence,
    });
  } catch (err) {
    console.error('PUT /api/predictions failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Could not save predictions' }, { status: 400 });
  }
}
