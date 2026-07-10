import { NextResponse } from 'next/server';
import { redisCommand } from '@/lib/redis-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TEMPORARY admin endpoint: set Nicolas's prediction for Spain v Belgium
// (wc-1581821) — 1-1 at full time, Spain 2-1 after extra time (Spain winner),
// Spain possession, Mikel Oyarzabal first scorer. Delete after use.
const KEY = 'wc2026:predictions:v1';
const FIXTURE = 'wc-1581821';
const USER = 'Nicolas';

export async function GET() {
  try {
    const raw = await redisCommand<string>(['GET', KEY]);
    const parsed = raw ? JSON.parse(raw) : { predictions: [], resetAt: null };
    const state = Array.isArray(parsed)
      ? { predictions: parsed, resetAt: null }
      : { predictions: parsed.predictions ?? [], resetAt: parsed.resetAt ?? null };

    const others = state.predictions.filter(
      (p: { fixtureId: string; userName: string }) => !(p.fixtureId === FIXTURE && p.userName === USER),
    );
    const prediction = {
      fixtureId: FIXTURE,
      userName: USER,
      homeScore: 1,
      awayScore: 1,
      submittedAt: new Date().toISOString(),
      possession: 'HOME',
      firstGoalscorer: 'Mikel Oyarzabal',
      homeScoreExtraTime: 2,
      awayScoreExtraTime: 1,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    };
    const next = { predictions: [...others, prediction], resetAt: state.resetAt };
    await redisCommand<string>(['SET', KEY, JSON.stringify(next)]);
    return NextResponse.json({ ok: true, prediction, total: next.predictions.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'failed' }, { status: 500 });
  }
}
