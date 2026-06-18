import { NextResponse } from 'next/server';
import { fixtures as mockFixtures } from '@/lib/mock-data';
import { squads } from '@/lib/squads';
import { readResults, writeResult, type StoredResult } from '@/lib/results-store';
import { redisCommand } from '@/lib/redis-store';
import {
  footballApiConfigured,
  fetchSeasonFixtures,
  fetchPossession,
  fetchFirstScorer,
  isFinished,
  teamsMatch,
  matchScorer,
  currentConfig,
  searchLeagues,
  type ApiFootballFixture,
} from '@/lib/football-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const META_KEY = 'wc2026:sync:meta';
const MIN_INTERVAL_MS = 120_000; // don't hammer the provider when many viewers are online

type SyncMeta = { lastAt: string | null };

async function readMeta(): Promise<SyncMeta> {
  try {
    const raw = await redisCommand<string>(['GET', META_KEY]);
    return raw ? (JSON.parse(raw) as SyncMeta) : { lastAt: null };
  } catch {
    return { lastAt: null };
  }
}
async function writeMeta(meta: SyncMeta) {
  try {
    await redisCommand<string>(['SET', META_KEY, JSON.stringify(meta)]);
  } catch {
    /* best effort */
  }
}

// Find the provider fixture for one of our fixtures. Returns the match plus
// whether home/away are reversed relative to ours (so we can swap scores).
function findProviderFixture(
  ours: (typeof mockFixtures)[number],
  pool: ApiFootballFixture[],
): { pf: ApiFootballFixture; reversed: boolean } | null {
  for (const pf of pool) {
    if (teamsMatch(pf.teams.home.name, ours.homeTeam) && teamsMatch(pf.teams.away.name, ours.awayTeam)) {
      return { pf, reversed: false };
    }
    if (teamsMatch(pf.teams.home.name, ours.awayTeam) && teamsMatch(pf.teams.away.name, ours.homeTeam)) {
      return { pf, reversed: true };
    }
  }
  return null;
}

async function runSync() {
  const seasonFixtures = await fetchSeasonFixtures();
  const existing = await readResults();
  const now = Date.now();

  const summary = { matched: 0, written: 0, skippedManual: 0, skippedComplete: 0, pending: 0 };

  for (const ours of mockFixtures) {
    if (now < ours.kickoff.getTime()) continue; // not started yet
    const prev = existing[ours.id];

    if (prev?.source === 'manual') { summary.skippedManual++; continue; }
    // already fully auto-populated (possession is the last field to arrive)
    if (prev?.source === 'auto' && prev.homePossession != null) { summary.skippedComplete++; continue; }

    const found = findProviderFixture(ours, seasonFixtures);
    if (!found) continue;
    summary.matched++;

    const { pf, reversed } = found;
    if (!isFinished(pf.fixture.status.short)) { summary.pending++; continue; }

    const pick = <T,>(home: T, away: T) => (reversed ? { home: away, away: home } : { home, away });

    const ft = pick(pf.score.fulltime.home, pf.score.fulltime.away);
    if (ft.home == null || ft.away == null) continue;

    const et = pick(pf.score.extratime.home, pf.score.extratime.away);
    const pen = pick(pf.score.penalty.home, pf.score.penalty.away);

    // Possession (per-team), mapped onto our home/away.
    let homePossession: number | undefined;
    let awayPossession: number | undefined;
    try {
      const poss = await fetchPossession(pf.fixture.id);
      if (poss) {
        if (teamsMatch(poss.homeName, ours.homeTeam)) {
          homePossession = poss.home; awayPossession = poss.away;
        } else {
          homePossession = poss.away; awayPossession = poss.home;
        }
      }
    } catch { /* possession optional */ }

    // First goalscorer, mapped to our squad spelling.
    let firstGoalscorer: string | null = null;
    try {
      const scorer = await fetchFirstScorer(pf.fixture.id);
      if (scorer) {
        const squad = teamsMatch(scorer.teamName, ours.homeTeam)
          ? squads[ours.homeTeam] ?? []
          : squads[ours.awayTeam] ?? [];
        firstGoalscorer = matchScorer(scorer.playerName, squad);
      }
    } catch { /* scorer optional */ }

    const result: StoredResult = {
      fixtureId: ours.id,
      homeScore90: ft.home,
      awayScore90: ft.away,
      homePossession,
      awayPossession,
      firstGoalscorer,
      homeScoreExtraTime: et.home ?? null,
      awayScoreExtraTime: et.away ?? null,
      homePenaltyScore: pen.home ?? null,
      awayPenaltyScore: pen.away ?? null,
      settledAt: new Date().toISOString(),
      source: 'auto',
    };
    await writeResult(result);
    summary.written++;
  }

  return summary;
}

async function handle(force: boolean) {
  if (!footballApiConfigured()) {
    return NextResponse.json({ ok: false, reason: 'API key not configured', persistence: 'disabled' });
  }

  const meta = await readMeta();
  const since = meta.lastAt ? Date.now() - new Date(meta.lastAt).getTime() : Infinity;
  if (!force && since < MIN_INTERVAL_MS) {
    return NextResponse.json({ ok: true, throttled: true, nextInMs: MIN_INTERVAL_MS - since });
  }

  // claim the slot up-front to avoid overlapping runs from concurrent viewers
  await writeMeta({ lastAt: new Date().toISOString() });

  try {
    const summary = await runSync();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error('sync-results failed:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'sync failed' }, { status: 502 });
  }
}

// Diagnostics: ?debug=1 shows what the provider returns so we can fix the
// league/season mapping or spot team-name mismatches. No secrets are exposed.
async function debugInfo() {
  if (!footballApiConfigured()) return NextResponse.json({ ok: false, reason: 'API key not configured' });
  const cfg = currentConfig();
  const out: Record<string, unknown> = { config: cfg };
  try {
    const fixtures = await fetchSeasonFixtures();
    out.seasonFixtureCount = fixtures.length;
    out.sample = fixtures.slice(0, 25).map(f => `${f.teams.home.name} vs ${f.teams.away.name} [${f.fixture.status.short}]`);
  } catch (err) {
    out.fixturesError = err instanceof Error ? err.message : String(err);
  }
  try {
    out.worldCupLeagues = await searchLeagues('world cup');
  } catch (err) {
    out.leaguesError = err instanceof Error ? err.message : String(err);
  }
  return NextResponse.json({ ok: true, debug: out });
}

// GET so it works from Vercel Cron and a browser; POST for the in-app trigger.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get('debug') === '1') return debugInfo();
  const force = params.get('force') === '1';
  return handle(force);
}
export async function POST(request: Request) {
  const force = new URL(request.url).searchParams.get('force') === '1';
  return handle(force);
}
