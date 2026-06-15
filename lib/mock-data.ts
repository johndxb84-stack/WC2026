import { dailyOrder, referenceRotationDate } from './domain';
export const players = [
  { id: 'nicolas', name: 'Nicolas', avatarUrl: '/avatars/nicolas.svg', totalPoints: 0 },
  { id: 'jean', name: 'Jean', avatarUrl: '/avatars/jean.svg', totalPoints: 0 },
  { id: 'anthony', name: 'Anthony', avatarUrl: '/avatars/anthony.svg', totalPoints: 0 },
];
export const fixtures = [
  { id: 'mock-1', homeTeam: 'Mexico', awayTeam: 'South Africa', homeLogo: '🇲🇽', awayLogo: '🇿🇦', kickoff: new Date('2026-06-15T19:00:00+04:00'), venue: 'Estadio Azteca', status: 'SCHEDULED' },
  { id: 'mock-2', homeTeam: 'United States', awayTeam: 'Canada', homeLogo: '🇺🇸', awayLogo: '🇨🇦', kickoff: new Date('2026-06-15T22:00:00+04:00'), venue: 'MetLife Stadium', status: 'SCHEDULED' },
];
export const mockPredictions = [
  { fixtureId: 'mock-1', userName: 'Nicolas', homeScore: 2, awayScore: 1, submittedAt: new Date('2026-06-15T09:00:00+04:00') },
  { fixtureId: 'mock-1', userName: 'Jean', homeScore: 1, awayScore: 1, submittedAt: new Date('2026-06-15T09:15:00+04:00') },
];
export function dashboardModel(now = new Date('2026-06-15T10:00:00+04:00')) {
  const order = dailyOrder(now);
  return { now, referenceRotationDate, timezone: 'Asia/Dubai', order, players, fixtures, predictions: mockPredictions };
}
