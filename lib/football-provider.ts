export interface FootballDataProvider { getCompetitions(): Promise<unknown[]>; getFixturesByDate(date: string): Promise<unknown[]>; getFixtureDetails(id: string): Promise<unknown>; getLiveScore(id: string): Promise<unknown>; getMatchEvents(id: string): Promise<unknown[]>; getMatchStatistics(id: string): Promise<unknown>; getLineups(id: string): Promise<unknown[]>; getFinalResult(id: string): Promise<unknown>; }
export class MockFootballProvider implements FootballDataProvider {
  async getCompetitions() { return [{ id: 'mock-wc-2026', name: 'FIFA World Cup', season: '2026' }]; }
  async getFixturesByDate() { return []; }
  async getFixtureDetails(id: string) { return { id }; }
  async getLiveScore(id: string) { return { id, status: 'SCHEDULED' }; }
  async getMatchEvents() { return []; }
  async getMatchStatistics() { return {}; }
  async getLineups() { return []; }
  async getFinalResult(id: string) { return { id, confirmed: false }; }
}
export function createFootballProvider(): FootballDataProvider { return new MockFootballProvider(); }
