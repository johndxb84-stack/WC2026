import { redisCommand } from './redis-store';

const resultsKey = 'wc2026:results:v1';

const mem = globalThis as typeof globalThis & { wc2026Results?: Record<string, StoredResult> };

export type StoredResult = {
  fixtureId: string;
  homeScore90: number;
  awayScore90: number;
  homePossession?: number;
  awayPossession?: number;
  firstGoalscorer?: string | null;
  homeScoreExtraTime?: number | null;
  awayScoreExtraTime?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  settledAt: string;
};

export async function readResults(): Promise<Record<string, StoredResult>> {
  try {
    const raw = await redisCommand<string>(['GET', resultsKey]);
    if (!raw) return mem.wc2026Results ?? {};
    return JSON.parse(raw) as Record<string, StoredResult>;
  } catch {
    return mem.wc2026Results ?? {};
  }
}

export async function writeResult(result: StoredResult): Promise<void> {
  const current = await readResults();
  const updated = { ...current, [result.fixtureId]: result };
  const serialized = JSON.stringify(updated);
  try {
    const remote = await redisCommand<string>(['SET', resultsKey, serialized]);
    if (remote === null) mem.wc2026Results = updated;
  } catch {
    mem.wc2026Results = updated;
  }
}
