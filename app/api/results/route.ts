import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readResults, writeResult, type StoredResult } from '@/lib/results-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const optNum = z.number().int().min(0).nullable().optional();

const resultSchema = z.object({
  fixtureId: z.string(),
  homeScore90: z.number().int().min(0),
  awayScore90: z.number().int().min(0),
  homePossession: z.number().min(0).max(100).optional(),
  awayPossession: z.number().min(0).max(100).optional(),
  firstGoalscorer: z.string().nullable().optional(),
  homeScoreExtraTime: optNum,
  awayScoreExtraTime: optNum,
  homePenaltyScore: optNum,
  awayPenaltyScore: optNum,
});

export async function GET() {
  try {
    const results = await readResults();
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error('GET /api/results failed:', err);
    return NextResponse.json({ ok: false, error: 'Failed to load results' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = resultSchema.parse(await request.json());
    const result: StoredResult = {
      fixtureId: body.fixtureId,
      homeScore90: body.homeScore90,
      awayScore90: body.awayScore90,
      homePossession: body.homePossession,
      awayPossession: body.awayPossession,
      firstGoalscorer: body.firstGoalscorer ?? null,
      homeScoreExtraTime: body.homeScoreExtraTime ?? null,
      awayScoreExtraTime: body.awayScoreExtraTime ?? null,
      homePenaltyScore: body.homePenaltyScore ?? null,
      awayPenaltyScore: body.awayPenaltyScore ?? null,
      settledAt: new Date().toISOString(),
      source: 'manual',
    };
    await writeResult(result);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('POST /api/results failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Server error' }, { status: 400 });
  }
}
