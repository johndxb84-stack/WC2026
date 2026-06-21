import { NextResponse } from 'next/server';
import { redisCommand } from '@/lib/redis-store';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('secret') !== 'fix-nicolas-21jun') {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const raw = await redisCommand<string>(['GET', storeKey]);
  if (!raw) return NextResponse.json({ ok: false, reason: 'no data in redis' }, { status: 404 });

  const state: PredictionState = JSON.parse(raw);

  const idx = state.predictions.findIndex(
    (p) => p.fixtureId === 'wc-1489397' && p.userName === 'Nicolas',
  );
  if (idx === -1) return NextResponse.json({ ok: false, reason: 'prediction not found' }, { status: 404 });

  const before = { ...state.predictions[idx] };
  state.predictions[idx] = { ...before, possession: 'HOME', firstGoalscorer: 'Dani Olmo' };
  const after = state.predictions[idx];

  await redisCommand(['SET', storeKey, JSON.stringify(state)]);

  return NextResponse.json({ ok: true, before, after });
}
