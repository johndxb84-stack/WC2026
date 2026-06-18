// Thin client for API-Football (api-sports.io v3) plus the name-matching helpers
// that bridge the provider's spellings to our fixtures and squads.

const API_BASE = 'https://v3.football.api-sports.io';

export function footballApiConfigured() {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

function cfg() {
  return {
    key: process.env.API_FOOTBALL_KEY ?? '',
    league: process.env.API_FOOTBALL_LEAGUE ?? '1', // 1 = FIFA World Cup
    season: process.env.API_FOOTBALL_SEASON ?? '2026',
  };
}

async function apiGet<T>(path: string): Promise<T> {
  const { key } = cfg();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': key },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API-Football ${path} → ${res.status}`);
  const json = (await res.json()) as { response: T; errors?: unknown };
  return json.response;
}

// ---------- Name normalisation ----------

function stripDiacritics(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function normalize(s: string) {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Our fixture team name -> canonical token, and the provider's name -> same token.
const TEAM_ALIASES: Record<string, string> = {
  'iran': 'iran', 'ir iran': 'iran',
  'south korea': 'korea', 'korea republic': 'korea', 'korea': 'korea',
  'czechia': 'czech', 'czech republic': 'czech',
  'cabo verde': 'capeverde', 'cape verde': 'capeverde', 'cape verde islands': 'capeverde',
  'dr congo': 'drcongo', 'congo dr': 'drcongo', 'democratic republic of congo': 'drcongo',
  'bosnia and herzegovina': 'bosnia', 'bosnia herzegovina': 'bosnia', 'bosnia': 'bosnia',
  'united states': 'usa', 'usa': 'usa', 'united states of america': 'usa',
};

export function canonicalTeam(name: string) {
  const n = normalize(name);
  return TEAM_ALIASES[n] ?? n.replace(/ /g, '');
}

export function teamsMatch(a: string, b: string) {
  return canonicalTeam(a) === canonicalTeam(b);
}

// Provider spelling -> our preferred display spelling (so flags & squads line up).
const DISPLAY_NAMES: Record<string, string> = {
  'cape verde islands': 'Cabo Verde',
  'iran': 'IR Iran',
  'congo dr': 'DR Congo',
  'czech republic': 'Czechia',
  'korea republic': 'South Korea',
  'bosnia & herzegovina': 'Bosnia and Herzegovina',
};
export function displayTeam(name: string) {
  return DISPLAY_NAMES[normalize(name)] ?? name;
}

// Match a provider goalscorer name to one of our squad spellings so the
// first-scorer point computes correctly. Returns our spelling, or the
// provider name unchanged if nothing lines up.
export function matchScorer(apiName: string | null | undefined, squad: string[]): string | null {
  if (!apiName) return null;
  const target = normalize(apiName);
  if (!target) return null;
  const targetParts = target.split(' ');
  const targetLast = targetParts[targetParts.length - 1];

  // 1) exact normalised match
  for (const s of squad) if (normalize(s) === target) return s;
  // 2) order-insensitive match ("Son Heung-min" vs "Heung-Min Son")
  for (const s of squad) {
    const sp = normalize(s).split(' ').sort().join(' ');
    if (sp === targetParts.slice().sort().join(' ')) return s;
  }
  // 3) surname match ("H. Son" / "Son" -> the squad member ending in that surname)
  const surnameHits = squad.filter(s => {
    const parts = normalize(s).split(' ');
    return parts[parts.length - 1] === targetLast || parts.includes(targetLast);
  });
  if (surnameHits.length === 1) return surnameHits[0];

  return apiName; // record it anyway; may not score but stays visible
}

// ---------- Provider shapes (only the fields we use) ----------

export type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed: number | null };
    venue: { name: string | null; city: string | null };
  };
  league: { round: string };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  score: {
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
};

type StatEntry = { type: string; value: string | number | null };
type ApiFootballStats = { team: { name: string }; statistics: StatEntry[] };
type ApiFootballEvent = {
  time: { elapsed: number | null; extra: number | null };
  team: { name: string };
  player: { name: string | null };
  type: string;
  detail: string;
};

const FINISHED = new Set(['FT', 'AET', 'PEN']);
export function isFinished(status: string) {
  return FINISHED.has(status);
}

const IN_PLAY = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
export function isInPlay(status: string) {
  return IN_PLAY.has(status);
}

export async function fetchSeasonFixtures(): Promise<ApiFootballFixture[]> {
  const { league, season } = cfg();
  return apiGet<ApiFootballFixture[]>(`/fixtures?league=${league}&season=${season}`);
}

export function currentConfig() {
  const { league, season } = cfg();
  return { league, season };
}

// Diagnostics: count fixtures for an explicit league/season (to test plan coverage).
export async function countFixtures(league: string | number, season: string | number) {
  const res = await apiGet<ApiFootballFixture[]>(`/fixtures?league=${league}&season=${season}`);
  return res.length;
}

// Diagnostics: list leagues matching a search term, with their available seasons.
export async function searchLeagues(term: string) {
  const res = await apiGet<Array<{ league: { id: number; name: string; type: string }; seasons: Array<{ year: number }> }>>(
    `/leagues?search=${encodeURIComponent(term)}`,
  );
  return res.map(r => ({ id: r.league.id, name: r.league.name, type: r.league.type, seasons: r.seasons.map(s => s.year) }));
}

// Possession percentages for a finished fixture, keyed by provider team name.
export async function fetchPossession(fixtureId: number): Promise<{ home: number; away: number; homeName: string; awayName: string } | null> {
  const stats = await apiGet<ApiFootballStats[]>(`/fixtures/statistics?fixture=${fixtureId}`);
  if (!stats || stats.length < 2) return null;
  const pct = (s: ApiFootballStats) => {
    const e = s.statistics.find(x => x.type === 'Ball Possession');
    if (!e || e.value == null) return null;
    const v = typeof e.value === 'string' ? parseInt(e.value, 10) : e.value;
    return Number.isFinite(v) ? Math.round(v) : null;
  };
  const h = pct(stats[0]);
  const a = pct(stats[1]);
  if (h == null || a == null) return null;
  return { home: h, away: a, homeName: stats[0].team.name, awayName: stats[1].team.name };
}

// The first goal of the match (earliest minute, excludes missed penalties).
export async function fetchFirstScorer(fixtureId: number): Promise<{ playerName: string | null; teamName: string } | null> {
  const events = await apiGet<ApiFootballEvent[]>(`/fixtures/events?fixture=${fixtureId}`);
  const goals = (events ?? [])
    .filter(e => e.type === 'Goal' && e.detail !== 'Missed Penalty')
    .sort((a, b) => ((a.time.elapsed ?? 0) + (a.time.extra ?? 0)) - ((b.time.elapsed ?? 0) + (b.time.extra ?? 0)));
  if (goals.length === 0) return null;
  return { playerName: goals[0].player.name, teamName: goals[0].team.name };
}
