import { redisCommand } from './redis-store';

const fixturesKey = 'wc2026:fixtures:v1';

const mem = globalThis as typeof globalThis & { wc2026Fixtures?: Record<string, ImportedFixture> };

// A fixture pulled automatically from the football API. id is `wc-{apiId}`,
// stable across syncs so predictions keyed to it stay valid.
export type ImportedFixture = {
  id: string;
  apiId: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;   // ISO
  venue: string | null;
  stage: string;
  status: string;
};

export async function readFixtures(): Promise<Record<string, ImportedFixture>> {
  try {
    const raw = await redisCommand<string>(['GET', fixturesKey]);
    if (!raw) return mem.wc2026Fixtures ?? {};
    return JSON.parse(raw) as Record<string, ImportedFixture>;
  } catch {
    return mem.wc2026Fixtures ?? {};
  }
}

// Upsert: merge new imports over what we already have so a fixture never
// disappears once stored (predictions/results stay attached).
export async function upsertFixtures(incoming: Record<string, ImportedFixture>): Promise<Record<string, ImportedFixture>> {
  const current = await readFixtures();
  const merged = { ...current, ...incoming };
  const serialized = JSON.stringify(merged);
  try {
    const remote = await redisCommand<string>(['SET', fixturesKey, serialized]);
    if (remote === null) mem.wc2026Fixtures = merged;
  } catch {
    mem.wc2026Fixtures = merged;
  }
  return merged;
}
