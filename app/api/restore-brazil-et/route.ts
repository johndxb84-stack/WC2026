import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREDICTIONS_KEY = 'wc2026:predictions:v1';
const FIXTURE_ID = 'wc-1562344'; // Brazil match — Jean: 1-1 at FT, 2-1 after ET

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

export async function GET() {
  try {
    const { redisCommand } = await import('@/lib/redis-store');

    const raw = await redisCommand<string>(['GET', PREDICTIONS_KEY]);
    let state: { predictions: StoredPrediction[]; resetAt: string | null } = { predictions: [], resetAt: null };
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Array.isArray(parsed) ? { predictions: parsed, resetAt: null } : parsed;
    }

    const updated: Array<{ fixtureId: string; before: string; after: string }> = [];
    for (const p of state.predictions) {
      if (p.userName === 'Jean' && p.fixtureId === FIXTURE_ID) {
        const before = `${p.homeScore}-${p.awayScore} (ET ${p.homeScoreExtraTime ?? '-'}-${p.awayScoreExtraTime ?? '-'})`;
        // Restore: draw at 90', Brazil wins 2-1 after extra time
        p.homeScore = 1;
        p.awayScore = 1;
        p.homeScoreExtraTime = 2;
        p.awayScoreExtraTime = 1;
        updated.push({ fixtureId: p.fixtureId, before, after: `1-1 (ET 2-1)` });
      }
    }

    await redisCommand(['SET', PREDICTIONS_KEY, JSON.stringify(state)]);

    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
