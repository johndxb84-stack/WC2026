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

// Fixed, idempotent set of Jean's predictions for the 24 Jun fixtures.
// This endpoint can ONLY ever upsert these exact rows for Jean — it takes no
// input and cannot write arbitrary data. Rows whose score collides with another
// player's existing prediction are skipped (house rule: no shared scores).
const BETS: Omit<StoredPrediction, 'submittedAt' | 'homeScoreExtraTime' | 'awayScoreExtraTime' | 'homePenaltyScore' | 'awayPenaltyScore'>[] = [
  { fixtureId: 'wc-1489408', userName: 'Jean', homeScore: 1, awayScore: 2, possession: 'AWAY', firstGoalscorer: 'Jonathan David' },      // Switzerland v Canada
  { fixtureId: 'wc-1539009', userName: 'Jean', homeScore: 2, awayScore: 0, possession: 'HOME', firstGoalscorer: 'Edin Džeko' },          // Bosnia & Herzegovina v Qatar
  { fixtureId: 'wc-1489405', userName: 'Jean', homeScore: 3, awayScore: 0, possession: 'HOME', firstGoalscorer: 'Youssef En-Nesyri' },   // Morocco v Haiti
  { fixtureId: 'wc-1489406', userName: 'Jean', homeScore: 0, awayScore: 2, possession: 'AWAY', firstGoalscorer: 'Vinicius Júnior' },     // Scotland v Brazil
  { fixtureId: 'wc-1539010', userName: 'Jean', homeScore: 0, awayScore: 2, possession: 'AWAY', firstGoalscorer: 'Santiago Giménez' },    // Czechia v Mexico
  { fixtureId: 'wc-1489407', userName: 'Jean', homeScore: 1, awayScore: 2, possession: 'AWAY', firstGoalscorer: 'Son Heung-min' },       // South Africa v South Korea
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = await redisCommand<string>(['GET', storeKey]);
  const state: PredictionState = raw ? JSON.parse(raw) : { predictions: [], resetAt: null };

  // Read-only probe: confirm which store this deployment is talking to.
  if (searchParams.get('check') === '1') {
    return NextResponse.json({ ok: true, mode: 'check', total: state.predictions.length });
  }

  const report: Record<string, unknown>[] = [];
  for (const b of BETS) {
    const clash = state.predictions.find(
      (p) =>
        p.fixtureId === b.fixtureId &&
        p.userName !== b.userName &&
        p.homeScore === b.homeScore &&
        p.awayScore === b.awayScore,
    );
    if (clash) {
      report.push({ fixtureId: b.fixtureId, status: 'SKIPPED_CLASH', clashWith: clash.userName, score: `${b.homeScore}-${b.awayScore}` });
      continue;
    }
    const without = state.predictions.filter(
      (p) => !(p.fixtureId === b.fixtureId && p.userName === b.userName),
    );
    without.push({
      ...b,
      submittedAt: new Date().toISOString(),
      homeScoreExtraTime: null,
      awayScoreExtraTime: null,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    });
    state.predictions = without;
    report.push({ fixtureId: b.fixtureId, status: 'ADDED', score: `${b.homeScore}-${b.awayScore}`, possession: b.possession, firstGoalscorer: b.firstGoalscorer });
  }

  await redisCommand(['SET', storeKey, JSON.stringify(state)]);
  return NextResponse.json({ ok: true, report, total: state.predictions.length });
}
