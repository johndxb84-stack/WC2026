import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREDICTIONS_KEY = 'wc2026:predictions:v1';
const FIXTURE_ID = 'wc-1564789'; // Ivory Coast (home) vs Norway (away)

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

    const updated: Array<{ user: string; before: string; after: string }> = [];
    for (const p of state.predictions) {
      if (p.userName === 'Jean' && p.fixtureId === FIXTURE_ID && p.homePenaltyScore === 4 && p.awayPenaltyScore === 2) {
        const before = `pen ${p.homePenaltyScore}-${p.awayPenaltyScore}`;
        // Jean backed Norway (away) — possession Norway, scorer Haaland. The shootout
        // score was entered in the wrong order; Norway winning 4-2 is home 2, away 4.
        p.homePenaltyScore = 2;
        p.awayPenaltyScore = 4;
        updated.push({ user: p.userName, before, after: 'pen 2-4 (Norway wins)' });
      }
    }

    await redisCommand(['SET', PREDICTIONS_KEY, JSON.stringify(state)]);
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
