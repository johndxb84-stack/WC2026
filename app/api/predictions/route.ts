import { NextResponse } from 'next/server';
import { z } from 'zod';

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

function redisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redisCommand<T>(command: unknown[]): Promise<T | null> {
  const config = redisConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Prediction store failed with ${response.status}`);
  const payload = await response.json() as { result: T | null };
  return payload.result;
}

function parseState(raw: string | null): PredictionState {
  if (!raw) {
    return memoryStore.wc2026PredictionState ?? { predictions: memoryStore.wc2026Predictions ?? [], resetAt: null };
  }

  const parsed = JSON.parse(raw) as PredictionState | StoredPrediction[];
  return Array.isArray(parsed) ? { predictions: parsed, resetAt: null } : { predictions: parsed.predictions ?? [], resetAt: parsed.resetAt ?? null };
}

async function readState(): Promise<PredictionState> {
  const remote = await redisCommand<string>(['GET', storeKey]);
  return parseState(remote);
}

async function writeState(state: PredictionState) {
  const serialized = JSON.stringify(state);
  const remote = await redisCommand<string>(['SET', storeKey, serialized]);
  if (remote === null) memoryStore.wc2026PredictionState = state;
}

async function readPredictions(): Promise<StoredPrediction[]> {
  return (await readState()).predictions;
}

async function writePredictions(predictions: StoredPrediction[]) {
  const current = await readState();
  await writeState({ predictions, resetAt: current.resetAt });
}

async function clearPredictions() {
  await writeState({ predictions: [], resetAt: new Date().toISOString() });
}

export async function GET() {
  const state = await readState();
  return NextResponse.json({ ...state, persistence: redisConfig() ? 'redis' : 'memory' });
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
  return NextResponse.json({ ok: true, predictions, resetAt: state.resetAt, persistence: redisConfig() ? 'redis' : 'memory' });
}


export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = z.array(predictionSchema).parse(body.predictions ?? body);
  const deduped: StoredPrediction[] = [];

  for (const prediction of parsed) {
    if (deduped.some((candidate) => candidate.fixtureId === prediction.fixtureId && candidate.userName === prediction.userName)) continue;
    if (deduped.some((candidate) => candidate.fixtureId === prediction.fixtureId && candidate.homeScore === prediction.homeScore && candidate.awayScore === prediction.awayScore)) continue;
    deduped.push(prediction);
  }

  await writePredictions(deduped);
  const state = await readState();
  return NextResponse.json({ ok: true, predictions: deduped, resetAt: state.resetAt, persistence: redisConfig() ? 'redis' : 'memory' });
}

export async function DELETE() {
  await clearPredictions();
  const state = await readState();
  return NextResponse.json({ ok: true, predictions: [], resetAt: state.resetAt, persistence: redisConfig() ? 'redis' : 'memory' });
}
