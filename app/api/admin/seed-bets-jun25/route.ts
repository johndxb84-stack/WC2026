import { redisCommand } from '@/lib/redis-store';
import { NextResponse } from 'next/server';

const REDIS_KEY = 'wc2026:predictions:v1';

const BETS = [
  { fixtureId: 'wc-1489410', userName: 'Jean', homeScore: 1, awayScore: 2, possession: 'AWAY', firstGoalscorer: 'Deniz Undav' },
  { fixtureId: 'wc-1489409', userName: 'Jean', homeScore: 0, awayScore: 2, possession: 'AWAY', firstGoalscorer: 'Sébastien Haller' },
  { fixtureId: 'wc-1539011', userName: 'Jean', homeScore: 2, awayScore: 1, possession: 'HOME', firstGoalscorer: 'Ayase Ueda' },
  { fixtureId: 'wc-1489412', userName: 'Jean', homeScore: 0, awayScore: 3, possession: 'AWAY', firstGoalscorer: 'Cody Gakpo' },
  { fixtureId: 'wc-1539012', userName: 'Jean', homeScore: 1, awayScore: 2, possession: 'AWAY', firstGoalscorer: 'Arda Güler' },
  { fixtureId: 'wc-1489411', userName: 'Jean', homeScore: 1, awayScore: 2, possession: 'AWAY', firstGoalscorer: 'Mitchell Duke' },
];

type StoredPrediction = {
  fixtureId: string;
  userName: string;
  homeScore: number;
  awayScore: number;
  submittedAt: string;
  possession?: string;
  firstGoalscorer?: string;
};

type PredictionState = { predictions: StoredPrediction[]; resetAt: string | null };

function parseState(raw: string | null): PredictionState {
  if (!raw) return { predictions: [], resetAt: null };
  const parsed = JSON.parse(raw) as PredictionState | StoredPrediction[];
  return Array.isArray(parsed)
    ? { predictions: parsed, resetAt: null }
    : { predictions: parsed.predictions ?? [], resetAt: parsed.resetAt ?? null };
}

export async function GET() {
  const raw = await redisCommand<string>(['GET', REDIS_KEY]);
  const state = parseState(raw);
  const report: string[] = [];
  const submittedAt = new Date().toISOString();

  for (const bet of BETS) {
    const fixturePreds = state.predictions.filter((p) => p.fixtureId === bet.fixtureId);
    const clashing = fixturePreds.find(
      (p) => p.userName !== bet.userName && p.homeScore === bet.homeScore && p.awayScore === bet.awayScore,
    );
    if (clashing) {
      report.push(`CLASH on ${bet.fixtureId}: ${clashing.userName} already has ${bet.homeScore}-${bet.awayScore}`);
      continue;
    }
    state.predictions = [
      ...state.predictions.filter((p) => !(p.fixtureId === bet.fixtureId && p.userName === bet.userName)),
      { fixtureId: bet.fixtureId, userName: bet.userName, homeScore: bet.homeScore, awayScore: bet.awayScore, submittedAt, possession: bet.possession, firstGoalscorer: bet.firstGoalscorer },
    ];
    report.push(`ADDED ${bet.userName} ${bet.homeScore}-${bet.awayScore} on ${bet.fixtureId}`);
  }

  await redisCommand(['SET', REDIS_KEY, JSON.stringify(state)]);
  return NextResponse.json({ ok: true, report, total: state.predictions.length });
}
