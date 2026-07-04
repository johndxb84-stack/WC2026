import { NextResponse } from 'next/server';
import { fixtures as mockFixtures, players as mockPlayers } from '@/lib/mock-data';
import { pushToAll } from '@/lib/push';
import { squads } from '@/lib/squads';
import { readResults, writeResults, type StoredResult } from '@/lib/results-store';
import { writeLive, type LiveSnapshot } from '@/lib/live-store';
import { upsertFixtures, type ImportedFixture } from '@/lib/fixtures-store';
import { redisCommand } from '@/lib/redis-store';
import {
  footballApiConfigured,
  fetchSeasonFixtures,
  fetchPossession,
  fetchFirstScorer,
  isFinished,
  isInPlay,
  teamsMatch,
  matchScorer,
  canonicalTeam,
  displayTeam,
  currentConfig,
  searchLeagues,
  countFixtures,
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
  ours: { homeTeam: string; awayTeam: string },
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

// A fixture to process, from either our manual list or the auto-imported set.
type Target = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  apiId?: number; // set for imported fixtures — lets us match by id, not name
};

// Dedupe imported vs manual by the (unordered) team pair. Our manual fixtures
// are all distinct group-stage pairings, and approximate kickoff times could
// cross a day boundary vs the real schedule — so we match on teams, not date.
function importKey(home: string, away: string) {
  return [canonicalTeam(home), canonicalTeam(away)].sort().join('|');
}

async function readBetFixtureIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const raw = await redisCommand<string>(['GET', 'wc2026:predictions:v1']);
    if (raw) {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : parsed.predictions ?? [];
      for (const p of arr) if (p?.fixtureId) ids.add(p.fixtureId);
    }
  } catch { /* none */ }
  return ids;
}

async function runSync() {
  const seasonFixtures = await fetchSeasonFixtures();
  const now = Date.now();

  // 1) Auto-import: every provider fixture that isn't already one of our manual
  // fixtures becomes an imported fixture (stable id wc-{apiId}).
  const manualKeys = new Set(mockFixtures.map(m => importKey(m.homeTeam, m.awayTeam)));
  const incoming: Record<string, ImportedFixture> = {};
  for (const pf of seasonFixtures) {
    const home = displayTeam(pf.teams.home.name);
    const away = displayTeam(pf.teams.away.name);
    if (manualKeys.has(importKey(home, away))) continue;
    const id = `wc-${pf.fixture.id}`;
    incoming[id] = {
      id, apiId: pf.fixture.id, homeTeam: home, awayTeam: away,
      kickoff: pf.fixture.date,
      venue: pf.fixture.venue?.name ?? null,
      stage: pf.league.round ?? '',
      status: pf.fixture.status.short,
    };
  }
  const importedAll = await upsertFixtures(incoming);

  // 2) Process results + live across manual and imported fixtures.
  const existing = await readResults();
  const betIds = await readBetFixtureIds();
  const updated: Record<string, StoredResult> = { ...existing };
  const live: Record<string, LiveSnapshot> = {};
  const summary = { imported: Object.keys(incoming).length, matched: 0, written: 0, skippedManual: 0, skippedComplete: 0, pending: 0, live: 0 };

  const targets: Target[] = [
    ...mockFixtures.map(m => ({ id: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam, kickoff: m.kickoff })),
    ...Object.values(importedAll).map(i => ({ id: i.id, homeTeam: i.homeTeam, awayTeam: i.awayTeam, kickoff: new Date(i.kickoff), apiId: i.apiId })),
  ];

  for (const ours of targets) {
    if (now < ours.kickoff.getTime()) continue; // not started yet
    const prev = existing[ours.id];
    if (prev?.source === 'manual') { summary.skippedManual++; continue; }

    // Match the provider fixture: by id for imported, by team names for manual.
    let pf: ApiFootballFixture | undefined;
    let reversed = false;
    if (ours.apiId != null) {
      pf = seasonFixtures.find(p => p.fixture.id === ours.apiId);
    } else {
      const found = findProviderFixture(ours, seasonFixtures);
      if (found) { pf = found.pf; reversed = found.reversed; }
    }
    if (!pf) continue;
    summary.matched++;

    const fixture = pf;
    const pick = <T,>(home: T, away: T) => (reversed ? { home: away, away: home } : { home, away });

    if (!isFinished(fixture.fixture.status.short)) {
      if (isInPlay(fixture.fixture.status.short)) {
        const g = pick(fixture.goals.home, fixture.goals.away);
        live[ours.id] = {
          fixtureId: ours.id, status: fixture.fixture.status.short, elapsed: fixture.fixture.status.elapsed,
          homeGoals: g.home ?? 0, awayGoals: g.away ?? 0, updatedAt: new Date().toISOString(),
        };
        summary.live++;
      }
      summary.pending++;
      continue;
    }

    // Finished. Only settle games someone actually bet on (or our manual ones).
    const isManual = ours.apiId == null;
    if (!isManual && !betIds.has(ours.id)) continue;

    // Already fully settled (possession is the last field to land) — don't refetch.
    if (prev?.source === 'auto' && prev.homePossession != null) { summary.skippedComplete++; continue; }

    const ft = pick(fixture.score.fulltime.home, fixture.score.fulltime.away);
    if (ft.home == null || ft.away == null) continue;
    // The provider reports extratime as goals scored DURING the ET period only.
    // Our convention is the full score AFTER extra time, so add the 90' score.
    const etPeriod = pick(fixture.score.extratime.home, fixture.score.extratime.away);
    const et = etPeriod.home != null && etPeriod.away != null
      ? { home: ft.home + etPeriod.home, away: ft.away + etPeriod.away }
      : { home: null, away: null };
    const pen = pick(fixture.score.penalty.home, fixture.score.penalty.away);

    let homePossession: number | undefined;
    let awayPossession: number | undefined;
    try {
      const poss = await fetchPossession(fixture.fixture.id);
      if (poss) {
        if (teamsMatch(poss.homeName, ours.homeTeam)) { homePossession = poss.home; awayPossession = poss.away; }
        else { homePossession = poss.away; awayPossession = poss.home; }
      }
    } catch { /* optional */ }

    let firstGoalscorer: string | null = null;
    try {
      const scorer = await fetchFirstScorer(fixture.fixture.id);
      if (scorer) {
        const squad = teamsMatch(scorer.teamName, ours.homeTeam) ? squads[ours.homeTeam] ?? [] : squads[ours.awayTeam] ?? [];
        firstGoalscorer = matchScorer(scorer.playerName, squad);
      }
    } catch { /* optional */ }

    updated[ours.id] = {
      fixtureId: ours.id,
      homeScore90: ft.home, awayScore90: ft.away,
      homePossession, awayPossession, firstGoalscorer,
      homeScoreExtraTime: et.home ?? null, awayScoreExtraTime: et.away ?? null,
      homePenaltyScore: pen.home ?? null, awayPenaltyScore: pen.away ?? null,
      settledAt: new Date().toISOString(), source: 'auto',
    };
    summary.written++;
  }

  if (summary.written > 0) {
    await writeResults(updated);
    // Notify all players about each newly-settled result
    const playerNames = mockPlayers.map(p => p.name);
    for (const [fixtureId, result] of Object.entries(updated)) {
      if (existing[fixtureId]) continue; // already existed before this sync
      const fixture = [...mockFixtures].find(f => f.id === fixtureId)
        ?? Object.values(incoming).find(f => f.id === fixtureId);
      if (!fixture) continue;
      const home = 'homeTeam' in fixture ? fixture.homeTeam : '';
      const away = 'awayTeam' in fixture ? fixture.awayTeam : '';
      await pushToAll(
        playerNames,
        `🏁 Result: ${home} ${result.homeScore90}–${result.awayScore90} ${away}`,
        `Check your points on the dashboard!`,
        '/',
      );
    }
  }
  await writeLive(live);
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
  // Probe plan coverage: a past WC (2022) vs the current one (2026).
  try {
    out.coverageProbe = {
      'league1_season2022': await countFixtures(1, 2022),
      'league1_season2026': await countFixtures(1, 2026),
    };
  } catch (err) {
    out.coverageError = err instanceof Error ? err.message : String(err);
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
