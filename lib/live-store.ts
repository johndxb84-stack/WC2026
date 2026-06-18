import { redisCommand } from './redis-store';

const liveKey = 'wc2026:live:v1';

const mem = globalThis as typeof globalThis & { wc2026Live?: Record<string, LiveSnapshot> };

export type LiveSnapshot = {
  fixtureId: string;
  status: string;        // provider short code: 1H, HT, 2H, ET, P…
  elapsed: number | null;
  homeGoals: number;
  awayGoals: number;
  updatedAt: string;
};

export async function readLive(): Promise<Record<string, LiveSnapshot>> {
  try {
    const raw = await redisCommand<string>(['GET', liveKey]);
    if (!raw) return mem.wc2026Live ?? {};
    return JSON.parse(raw) as Record<string, LiveSnapshot>;
  } catch {
    return mem.wc2026Live ?? {};
  }
}

// Overwrites the whole live map each sync, so finished/stale games drop out.
export async function writeLive(map: Record<string, LiveSnapshot>): Promise<void> {
  const serialized = JSON.stringify(map);
  try {
    const remote = await redisCommand<string>(['SET', liveKey, serialized]);
    if (remote === null) mem.wc2026Live = map;
  } catch {
    mem.wc2026Live = map;
  }
}
