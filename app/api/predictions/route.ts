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

const memoryStore = globalThis as typeof globalThis & { wc2026Predictions?: StoredPrediction[] };

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

async function readPredictions(): Promise<StoredPrediction[]> {
  const remote = await redisCommand<string>(['GET', storeKey]);
  if (remote) return JSON.parse(remote) as StoredPrediction[];
  return memoryStore.wc2026Predictions ?? [];
}

async function writePredictions(predictions: StoredPrediction[]) {
  const serialized = JSON.stringify(predictions);
  const remote = await redisCommand<string>(['SET', storeKey, serialized]);
  if (remote === null) memoryStore.wc2026Predictions = predictions;
}

async function clearPredictions() {
  const remote = await redisCommand<number>(['DEL', storeKey]);
  if (remote === null) memoryStore.wc2026Predictions = [];
}

export async function GET() {
  return NextResponse.json({ predictions: await readPredictions(), persistence: redisConfig() ? 'redis' : 'memory' });
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
  return NextResponse.json({ ok: true, predictions, persistence: redisConfig() ? 'redis' : 'memory' });
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
  return NextResponse.json({ ok: true, predictions: deduped, persistence: redisConfig() ? 'redis' : 'memory' });
}

export async function DELETE() {
  await clearPredictions();
  return NextResponse.json({ ok: true, predictions: [], persistence: redisConfig() ? 'redis' : 'memory' });
}
