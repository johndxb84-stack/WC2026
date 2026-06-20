// Per-fixture custom betting orders. Key is the two team names lowercased and
// sorted alphabetically, joined with a pipe. The order must be exhaustive —
// all three players — and is validated at runtime.
const CUSTOM_ORDERS: Record<string, string[]> = {
  'japan|tunisia': ['Anthony', 'Nicolas', 'Jean'],
};

export function customFixtureOrder(homeTeam: string, awayTeam: string): string[] | null {
  const key = [homeTeam.toLowerCase(), awayTeam.toLowerCase()].sort().join('|');
  return CUSTOM_ORDERS[key] ?? null;
}
