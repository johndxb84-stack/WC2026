import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fixtures as mockFixtures, players as mockPlayers } from '@/lib/mock-data';
import { redisCommand, redisPersistenceConfigured, redisLastError } from '@/lib/redis-store';

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

const predSchema = z.object({
  fixtureId: z.string(),
  userName: z.string(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  submittedAt: z.union([z.string(), z.date()]).transform((v) => new Date(v).toISOString()).optional(),
  possession: z.string().optional(),
  firstGoalscorer: z.string().optional(),
});

const bulkPredSchema = z.object({
  fixtureId: z.string(),
  userName: z.string(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  submittedAt: z.union([z.string(), z.date()]).transform((v) => new Date(v).toISOString()),
  possession: z.string().optional(),
  firstGoalscorer: z.string().optional(),
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
    submittedAt: p.submittedAt,
    status: 'SUBMITTED',
    score: null,
  };
}

export async function GET() {
  try {
    const state = await readState();
    const persistence = redisPersistenceConfigured() && !redisLastError() ? 'redis' : 'memory';
    return NextResponse.json({
      fixtures: mockFixtures.map(toApiFixture),
      predictions: state.predictions.map(toApiPrediction),
      players: mockPlayers.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, totalPoints: 0 })),
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
