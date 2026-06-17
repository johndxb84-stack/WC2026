export type ProviderFinalResult = {
  confirmed: boolean;
  homeScore90?: number;
  awayScore90?: number;
  homePossession?: number;
  awayPossession?: number;
  firstGoalscorerId?: string | null;
  homeScoreExtraTime?: number | null;
  awayScoreExtraTime?: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
};

export interface FootballDataProvider {
  getCompetitions(): Promise<unknown[]>;
  getFixturesByDate(date: string): Promise<unknown[]>;
  getFixtureDetails(id: string): Promise<unknown>;
  getLiveScore(id: string): Promise<unknown>;
  getMatchEvents(id: string): Promise<unknown[]>;
  getMatchStatistics(id: string): Promise<unknown>;
  getLineups(id: string): Promise<unknown[]>;
  getFinalResult(id: string): Promise<ProviderFinalResult>;
}

export class MockFootballProvider implements FootballDataProvider {
  async getCompetitions() { return [{ id: 'mock-wc-2026', name: 'FIFA World Cup', season: '2026' }]; }
  async getFixturesByDate() { return []; }
  async getFixtureDetails(id: string) { return { id }; }
  async getLiveScore(id: string) { return { id, status: 'SCHEDULED' }; }
  async getMatchEvents() { return []; }
  async getMatchStatistics() { return {}; }
  async getLineups() { return []; }
  async getFinalResult(): Promise<ProviderFinalResult> { return { confirmed: false }; }
}

type ApiFootballFixture = {
  fixture: { id: number; status: { short: string } };
  goals: { home: number | null; away: number | null };
  score: {
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
};

type ApiFootballEvent = {
  type: string;
  detail: string;
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
};

type ApiFootballStatistic = {
  team: { id: number; name: string };
  statistics: Array<{ type: string; value: string | number | null }>;
};

export class ApiFootballProvider implements FootballDataProvider {
  private readonly baseUrl = process.env.API_FOOTBALL_BASE_URL ?? 'https://v3.football.api-sports.io';
  private readonly apiKey = process.env.API_FOOTBALL_KEY ?? process.env.FOOTBALL_API_KEY;
  private readonly finishedStatuses = new Set(['FT', 'AET', 'PEN']);

  private async request<T>(path: string, params?: Record<string, string>) {
    if (!this.apiKey) throw new Error('API_FOOTBALL_KEY is not configured');
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

    const response = await fetch(url, {
      headers: { 'x-apisports-key': this.apiKey },
      cache: 'no-store',
    });

    if (!response.ok) throw new Error(`API-Football request failed with ${response.status}`);
    const payload = await response.json() as { response: T };
    return payload.response;
  }

  async getCompetitions() { return this.request<unknown[]>('/leagues'); }
  async getFixturesByDate(date: string) { return this.request<unknown[]>('/fixtures', { date }); }
  async getFixtureDetails(id: string) { return this.request<unknown[]>('/fixtures', { id }); }
  async getLiveScore(id: string) { return this.request<unknown[]>('/fixtures', { id }); }
  async getMatchEvents(id: string) { return this.request<unknown[]>('/fixtures/events', { fixture: id }); }
  async getMatchStatistics(id: string) { return this.request<unknown[]>('/fixtures/statistics', { fixture: id }); }
  async getLineups(id: string) { return this.request<unknown[]>('/fixtures/lineups', { fixture: id }); }

  async getFinalResult(id: string): Promise<ProviderFinalResult> {
    const fixtures = await this.request<ApiFootballFixture[]>('/fixtures', { id });
    const fixture = fixtures[0];
    if (!fixture || !this.finishedStatuses.has(fixture.fixture.status.short)) return { confirmed: false };

    const [events, statistics] = await Promise.all([
      this.request<ApiFootballEvent[]>('/fixtures/events', { fixture: id }).catch(() => []),
      this.request<ApiFootballStatistic[]>('/fixtures/statistics', { fixture: id }).catch(() => []),
    ]);

    const firstGoal = events.find((event) => event.type === 'Goal' && !event.detail.toLowerCase().includes('missed'));
    const possession = statistics.map((team) => {
      const value = team.statistics.find((statistic) => statistic.type === 'Ball Possession')?.value;
      const percent = typeof value === 'string' ? Number(value.replace('%', '')) : typeof value === 'number' ? value : undefined;
      return { teamId: team.team.id, percent };
    });

    const homePossession = possession[0]?.percent;
    const awayPossession = possession[1]?.percent;

    return {
      confirmed: true,
      homeScore90: fixture.score.fulltime.home ?? fixture.goals.home ?? 0,
      awayScore90: fixture.score.fulltime.away ?? fixture.goals.away ?? 0,
      homePossession,
      awayPossession,
      firstGoalscorerId: firstGoal?.player.name ?? null,
      homeScoreExtraTime: fixture.score.extratime.home,
      awayScoreExtraTime: fixture.score.extratime.away,
      homePenaltyScore: fixture.score.penalty.home,
      awayPenaltyScore: fixture.score.penalty.away,
    };
  }
}

export function createFootballProvider(): FootballDataProvider {
  return process.env.FOOTBALL_PROVIDER === 'api-football' ? new ApiFootballProvider() : new MockFootballProvider();
}
