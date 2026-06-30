import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESULTS_KEY = 'wc2026:results:v1';
const FIXTURE_ID = 'wc-1562345'; // Netherlands vs Morocco

export async function GET() {
  try {
    const { redisCommand } = await import('@/lib/redis-store');
    const raw = await redisCommand<string>(['GET', RESULTS_KEY]);
    const map = raw ? JSON.parse(raw) : {};
    const r = map[FIXTURE_ID];
    if (!r) return NextResponse.json({ ok: false, error: 'result not found' }, { status: 404 });
    const before = `ET ${r.homeScoreExtraTime}-${r.awayScoreExtraTime}`;
    // ET should be the full score AFTER extra time. The match was 1-1 at FT with no
    // goals in extra time, so the score after ET is 1-1 (was stored as 0-0 period goals).
    r.homeScoreExtraTime = 1;
    r.awayScoreExtraTime = 1;
    r.source = 'manual'; // protect from auto-sync overwrite
    map[FIXTURE_ID] = r;
    await redisCommand(['SET', RESULTS_KEY, JSON.stringify(map)]);
    return NextResponse.json({ ok: true, fixtureId: FIXTURE_ID, before, after: 'ET 1-1' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
