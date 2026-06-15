import { NextResponse } from 'next/server';
import { createFootballProvider } from '@/lib/football-provider';
import { fixtures } from '@/lib/mock-data';

export const dynamic = 'force-dynamic';

function fixtureProviderIds() {
  try {
    return JSON.parse(process.env.FOOTBALL_FIXTURE_ID_MAP ?? '{}') as Record<string, string>;
  } catch {
    console.error('Invalid FOOTBALL_FIXTURE_ID_MAP JSON; falling back to app fixture ids.');
    return {};
  }
}

export async function POST(request: Request) {
  const provider = createFootballProvider();
  const origin = new URL(request.url).origin;
  const attempted: string[] = [];
  const settled: string[] = [];

  const fixtureIdMap = fixtureProviderIds();

  for (const fixture of fixtures) {
    const providerFixtureId = fixtureIdMap[fixture.id] ?? fixture.id;
    attempted.push(providerFixtureId);
    const finalResult = await provider.getFinalResult(providerFixtureId) as { confirmed?: boolean } & Record<string, unknown>;
    if (!finalResult.confirmed) continue;

    const response = await fetch(`${origin}/api/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture: { fixtureId: fixture.id, ...finalResult } }),
    });

    if (response.ok) settled.push(fixture.id);
  }

  return NextResponse.json({ ok: true, attempted, settled, provider: process.env.FOOTBALL_PROVIDER ?? 'mock' });
}

export async function GET(request: Request) {
  return POST(request);
}
