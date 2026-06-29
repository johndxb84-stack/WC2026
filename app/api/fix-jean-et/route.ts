import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREDICTIONS_KEY = 'wc2026:predictions:v1';

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

    // Find Jean's prediction where 90' is 1-1 and ET is 2-1 — set exact score to 2-1, clear ET.
    const updated: Array<{ fixtureId: string; before: string; after: string }> = [];
    for (const p of state.predictions) {
      if (
        p.userName === 'Jean' &&
        p.homeScore === 1 &&
        p.awayScore === 1 &&
        p.homeScoreExtraTime === 2 &&
        p.awayScoreExtraTime === 1
      ) {
        const before = `${p.homeScore}-${p.awayScore} (ET ${p.homeScoreExtraTime}-${p.awayScoreExtraTime})`;
        p.homeScore = 2;
        p.awayScore = 1;
        p.homeScoreExtraTime = null;
        p.awayScoreExtraTime = null;
        updated.push({ fixtureId: p.fixtureId, before, after: `${p.homeScore}-${p.awayScore}` });
      }
    }

    await redisCommand(['SET', PREDICTIONS_KEY, JSON.stringify(state)]);

    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
