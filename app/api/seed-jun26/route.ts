import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREDICTIONS_KEY = 'wc2026:predictions:v1';

const NEW_PREDS = [
  // Norway vs France  (wc-1489416) — Jean: France win 1-3, Mbappé, France poss
  {
    fixtureId: 'wc-1489416',
    userName: 'Jean',
    homeScore: 1,
    awayScore: 3,
    possession: 'France',
    firstGoalscorer: 'Kylian Mbappé',
    submittedAt: new Date().toISOString(),
  },
  // Senegal vs Iraq  (wc-1539074) — Jean: Senegal win 2-0, N. Jackson, Senegal poss
  {
    fixtureId: 'wc-1539074',
    userName: 'Jean',
    homeScore: 2,
    awayScore: 0,
    possession: 'Senegal',
    firstGoalscorer: 'Nicolas Jackson',
    submittedAt: new Date().toISOString(),
  },
  // Egypt vs IR Iran  (wc-1489414) — Jean: Egypt win 2-1, Salah, Egypt poss
  {
    fixtureId: 'wc-1489414',
    userName: 'Jean',
    homeScore: 2,
    awayScore: 1,
    possession: 'Egypt',
    firstGoalscorer: 'Mohamed Salah',
    submittedAt: new Date().toISOString(),
  },
  // New Zealand vs Belgium  (wc-1489415) — Jean: Belgium win 0-2, Lukaku, Belgium poss
  {
    fixtureId: 'wc-1489415',
    userName: 'Jean',
    homeScore: 0,
    awayScore: 2,
    possession: 'Belgium',
    firstGoalscorer: 'Romelu Lukaku',
    submittedAt: new Date().toISOString(),
  },
  // Uruguay vs Spain  (wc-1489417) — Jean: Spain win 1-3, Yamal, Spain poss
  {
    fixtureId: 'wc-1489417',
    userName: 'Jean',
    homeScore: 1,
    awayScore: 3,
    possession: 'Spain',
    firstGoalscorer: 'Lamine Yamal',
    submittedAt: new Date().toISOString(),
  },
  // Cabo Verde vs Saudi Arabia  (wc-1489413) — Jean: Cape Verde win 1-0, R. Mendes, Cabo Verde poss
  {
    fixtureId: 'wc-1489413',
    userName: 'Jean',
    homeScore: 1,
    awayScore: 0,
    possession: 'Cabo Verde',
    firstGoalscorer: 'Ryan Mendes',
    submittedAt: new Date().toISOString(),
  },
];

export async function POST() {
  try {
    const { redisCommand } = await import('@/lib/redis-store');

    const raw = await redisCommand<string>(['GET', PREDICTIONS_KEY]);
    let state: { predictions: typeof NEW_PREDS; resetAt: string | null } = { predictions: [], resetAt: null };
    if (raw) {
      const parsed = JSON.parse(raw);
      state = Array.isArray(parsed) ? { predictions: parsed, resetAt: null } : parsed;
    }

    // Remove any existing Jean predictions for these fixtures
    const fixtureIds = new Set(NEW_PREDS.map(p => p.fixtureId));
    state.predictions = state.predictions.filter(
      p => !(p.userName === 'Jean' && fixtureIds.has(p.fixtureId))
    );

    state.predictions.push(...NEW_PREDS);
    await redisCommand(['SET', PREDICTIONS_KEY, JSON.stringify(state)]);

    return NextResponse.json({ ok: true, added: NEW_PREDS.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
