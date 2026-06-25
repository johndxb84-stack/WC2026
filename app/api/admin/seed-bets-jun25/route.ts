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

export async function GET() {
  const raw = await redisCommand<string>(['GET', REDIS_KEY]);
  const store: Record<string, unknown[]> = raw ? JSON.parse(raw) : {};

  const report: string[] = [];

  for (const bet of BETS) {
    const existing: unknown[] = store[bet.fixtureId] ?? [];
    const clashing = (existing as Array<{ userName: string; homeScore: number; awayScore: number }>).find(
      (p) => p.userName !== bet.userName && p.homeScore === bet.homeScore && p.awayScore === bet.awayScore,
    );
    if (clashing) {
      report.push(`CLASH on ${bet.fixtureId}: ${clashing.userName} already has ${bet.homeScore}-${bet.awayScore}`);
      continue;
    }
    const withoutJean = (existing as Array<{ userName: string }>).filter((p) => p.userName !== bet.userName);
    store[bet.fixtureId] = [
      ...withoutJean,
      {
        userName: bet.userName,
        homeScore: bet.homeScore,
        awayScore: bet.awayScore,
        possession: bet.possession,
        firstGoalscorer: bet.firstGoalscorer,
      },
    ];
    report.push(`ADDED ${bet.userName} ${bet.homeScore}-${bet.awayScore} on ${bet.fixtureId}`);
  }

  await redisCommand(['SET', REDIS_KEY, JSON.stringify(store)]);

  const total = Object.values(store).reduce((s, arr) => s + (arr as unknown[]).length, 0);
  return NextResponse.json({ ok: true, report, total });
}
