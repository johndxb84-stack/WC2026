import { NextResponse } from 'next/server';
import { z } from 'zod';
import { redisCommand, redisEnvStatus, redisLastError, redisPersistenceConfigured } from '@/lib/redis-store';

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
  extraTimeApplicable?: boolean;
  homeScoreExtraTime?: number;
  awayScoreExtraTime?: number;
  penaltiesApplicable?: boolean;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
};

const predictionSchema = z.object({
  fixtureId: z.string(),
  userName: z.string(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  submittedAt: z.string().or(z.date()).transform((value) => new Date(value).toISOString()),
  possession: z.string().optional(),
  firstGoalscorer: z.string().optional(),
  extraTimeApplicable: z.boolean().optional(),
  homeScoreExtraTime: z.number().int().min(0).optional(),
  awayScoreExtraTime: z.number().int().min(0).optional(),
  penaltiesApplicable: z.boolean().optional(),
  homePenaltyScore: z.number().int().min(0).optional(),
  awayPenaltyScore: z.number().int().min(0).optional(),
});

type PredictionState = { predictions: StoredPrediction[]; resetAt: string | null };

const memoryStore = globalThis as typeof globalThis & { wc2026PredictionState?: PredictionState; wc2026Predictions?: StoredPrediction[] };
type ManualPredictionOverride = {
  fixtureId: string;
  userName: string;
  before: string;
  fields: Pick<StoredPrediction, 'possession' | 'firstGoalscorer'>;
};

const manualPredictionOverrides: ManualPredictionOverride[] = [
  {
    fixtureId: 'match-14',
    userName: 'Anthony',
    before: '2026-06-15T17:15:00.000Z',
    fields: {
      possession: 'HOME',
      firstGoalscorer: 'Lamine Yamal',
    },
  },
  {
    fixtureId: 'match-20',
    userName: 'Anthony',
    before: '2026-06-16T08:30:00.000Z',
    fields: {
      firstGoalscorer: 'Marko Arnautović',
    },
  },
];

function applyManualOverrides(predictions: StoredPrediction[]): StoredPrediction[] {
  return predictions.map((prediction) => {
    const override = manualPredictionOverrides.find((candidate) =>
      candidate.fixtureId === prediction.fixtureId &&
      candidate.userName === prediction.userName &&
      new Date(prediction.submittedAt).getTime() <= new Date(candidate.before).getTime()
    );

    return override ? { ...prediction, ...override.fields } : prediction;
  });
}

function parseState(raw: string | null): PredictionState {
  if (!raw) {
    return memoryStore.wc2026PredictionState ?? { predictions: memoryStore.wc2026Predictions ?? [], resetAt: null };
  }

  const parsed = JSON.parse(raw) as PredictionState | StoredPrediction[];
  return Array.isArray(parsed) ? { predictions: parsed, resetAt: null } : { predictions: parsed.predictions ?? [], resetAt: parsed.resetAt ?? null };
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

async function readPredictions(): Promise<StoredPrediction[]> {
  return applyManualOverrides((await readState()).predictions);
}

async function writePredictions(predictions: StoredPrediction[]) {
  const current = await readState();
  await writeState({ predictions, resetAt: current.resetAt });
}


function mergePredictionRecords(primary: StoredPrediction[], backup: StoredPrediction[]) {
  const merged = new Map<string, StoredPrediction>();

  for (const prediction of [...backup, ...primary]) {
    const key = `${prediction.fixtureId}:${prediction.userName}`;
    const existing = merged.get(key);
    if (!existing || new Date(prediction.submittedAt).getTime() >= new Date(existing.submittedAt).getTime()) {
      merged.set(key, prediction);
    }
  }

  return [...merged.values()];
}

async function clearPredictions() {
  await writeState({ predictions: [], resetAt: new Date().toISOString() });
}

export async function GET() {
  const state = await readState();
  const env = redisEnvStatus();
  return NextResponse.json({
    ...state,
    predictions: applyManualOverrides(state.predictions),
    persistence: redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory',
    env,
  });
}

export async function POST(request: Request) {
  const prediction = predictionSchema.parse(await request.json());
  const existing = await readPredictions();
  const withoutDuplicateUser = existing.filter((candidate) => !(candidate.fixtureId === prediction.fixtureId && candidate.userName === prediction.userName));

  if (withoutDuplicateUser.some((candidate) => candidate.fixtureId === prediction.fixtureId && candidate.homeScore === prediction.homeScore && candidate.awayScore === prediction.awayScore)) {
    return NextResponse.json({ ok: false, reason: 'This score has already been selected. Please choose another score.' }, { status: 409 });
  }

  const predictions = [...withoutDuplicateUser, prediction];
  await writePredictions(predictions);
  const state = await readState();
  return NextResponse.json({ ok: true, predictions, resetAt: state.resetAt, persistence: redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory' });
}


export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = z.array(predictionSchema).parse(body.predictions ?? body);
    const existing = await readPredictions();

    // Backup restore / device push must never downgrade Redis by replacing a larger
    // shared set with a smaller device-local set. Merge by user+fixture instead.
    const merged = mergePredictionRecords(parsed, existing);

    await writePredictions(merged);
    const state = await readState();
    return NextResponse.json({ ok: true, predictions: merged, receivedCount: parsed.length, storedCount: merged.length, resetAt: state.resetAt, persistence: redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory' });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Could not save predictions' }, { status: 400 });
  }
}

export async function DELETE() {
  await clearPredictions();
  const state = await readState();
  return NextResponse.json({ ok: true, predictions: [], resetAt: state.resetAt, persistence: redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory' });
}
