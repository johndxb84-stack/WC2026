import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESULTS_KEY = 'wc2026:results:v1';

type StoredResult = {
  fixtureId: string;
  homeScore90: number;
  awayScore90: number;
  homeScoreExtraTime?: number | null;
  awayScoreExtraTime?: number | null;
  source?: 'manual' | 'auto';
  [k: string]: unknown;
};

// One-shot migration: auto-synced results stored extra time as goals scored
// DURING the ET period (provider convention). Convert to the full score AFTER
// extra time by adding the 90' score. A cumulative after-ET score can never be
// lower than the 90' score, so any auto result where ET < 90' needs converting.
export async function GET() {
  try {
    const { redisCommand } = await import('@/lib/redis-store');
    const raw = await redisCommand<string>(['GET', RESULTS_KEY]);
    const map: Record<string, StoredResult> = raw ? JSON.parse(raw) : {};

    const updated: Array<{ fixtureId: string; before: string; after: string }> = [];
    for (const r of Object.values(map)) {
      if (r.source !== 'auto') continue;
      if (r.homeScoreExtraTime == null || r.awayScoreExtraTime == null) continue;
      // Already cumulative? Then both ET values are >= the 90' score.
      if (r.homeScoreExtraTime >= r.homeScore90 && r.awayScoreExtraTime >= r.awayScore90) continue;
      const before = `ET ${r.homeScoreExtraTime}-${r.awayScoreExtraTime}`;
      r.homeScoreExtraTime = r.homeScore90 + r.homeScoreExtraTime;
      r.awayScoreExtraTime = r.awayScore90 + r.awayScoreExtraTime;
      updated.push({ fixtureId: r.fixtureId, before, after: `ET ${r.homeScoreExtraTime}-${r.awayScoreExtraTime}` });
    }

    await redisCommand(['SET', RESULTS_KEY, JSON.stringify(map)]);
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
