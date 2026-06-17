import { dailyOrder, referenceRotationDate, type PredictionRecord } from './domain';

export const players = [
  { id: 'nicolas', name: 'Nicolas', avatarUrl: '/avatars/nicolas.svg', totalPoints: 0 },
  { id: 'jean', name: 'Jean', avatarUrl: '/avatars/jean.svg', totalPoints: 0 },
  { id: 'anthony', name: 'Anthony', avatarUrl: '/avatars/anthony.svg', totalPoints: 0 },
];

export const fixtures = [
  { id: 'match-14', homeTeam: 'Spain', awayTeam: 'Cabo Verde', homeLogo: '🇪🇸', awayLogo: '🇨🇻', kickoff: new Date('2026-06-15T20:00:00+04:00'), venue: 'Atlanta Stadium', stage: 'Group H', status: 'SCHEDULED' },
  { id: 'match-16', homeTeam: 'Belgium', awayTeam: 'Egypt', homeLogo: '🇧🇪', awayLogo: '🇪🇬', kickoff: new Date('2026-06-16T02:00:00+04:00'), venue: 'Seattle Stadium', stage: 'Group G', status: 'SCHEDULED' },
  { id: 'match-13', homeTeam: 'Saudi Arabia', awayTeam: 'Uruguay', homeLogo: '🇸🇦', awayLogo: '🇺🇾', kickoff: new Date('2026-06-16T02:00:00+04:00'), venue: 'Miami Stadium', stage: 'Group H', status: 'SCHEDULED' },
  { id: 'match-15', homeTeam: 'IR Iran', awayTeam: 'New Zealand', homeLogo: '🇮🇷', awayLogo: '🇳🇿', kickoff: new Date('2026-06-16T05:00:00+04:00'), venue: 'Los Angeles Stadium', stage: 'Group G', status: 'SCHEDULED' },
  { id: 'match-17', homeTeam: 'France', awayTeam: 'Senegal', homeLogo: '🇫🇷', awayLogo: '🇸🇳', kickoff: new Date('2026-06-16T23:00:00+04:00'), venue: 'New York New Jersey Stadium', stage: 'Group I', status: 'SCHEDULED' },
  { id: 'match-18', homeTeam: 'Iraq', awayTeam: 'Norway', homeLogo: '🇮🇶', awayLogo: '🇳🇴', kickoff: new Date('2026-06-17T02:00:00+04:00'), venue: 'Boston Stadium', stage: 'Group I', status: 'SCHEDULED' },
  { id: 'match-19', homeTeam: 'Argentina', awayTeam: 'Algeria', homeLogo: '🇦🇷', awayLogo: '🇩🇿', kickoff: new Date('2026-06-17T05:00:00+04:00'), venue: 'Kansas City Stadium', stage: 'Group J', status: 'SCHEDULED' },
  { id: 'match-20', homeTeam: 'Austria', awayTeam: 'Jordan', homeLogo: '🇦🇹', awayLogo: '🇯🇴', kickoff: new Date('2026-06-16T08:00:00+04:00'), venue: 'San Francisco Bay Stadium', stage: 'Group J', status: 'SCHEDULED' },
  { id: 'match-21', homeTeam: 'Portugal', awayTeam: 'DR Congo', homeLogo: '🇵🇹', awayLogo: '🇨🇩', kickoff: new Date('2026-06-17T21:00:00+04:00'), venue: 'Houston Stadium', stage: 'Group K', status: 'SCHEDULED' },
  { id: 'match-22', homeTeam: 'England', awayTeam: 'Croatia', homeLogo: '🏴', awayLogo: '🇭🇷', kickoff: new Date('2026-06-18T00:00:00+04:00'), venue: 'Dallas Stadium', stage: 'Group L', status: 'SCHEDULED' },
  { id: 'match-23', homeTeam: 'Ghana', awayTeam: 'Panama', homeLogo: '🇬🇭', awayLogo: '🇵🇦', kickoff: new Date('2026-06-18T03:00:00+04:00'), venue: 'Toronto Stadium', stage: 'Group L', status: 'SCHEDULED' },
  { id: 'match-24', homeTeam: 'Uzbekistan', awayTeam: 'Colombia', homeLogo: '🇺🇿', awayLogo: '🇨🇴', kickoff: new Date('2026-06-18T06:00:00+04:00'), venue: 'Vancouver Stadium', stage: 'Group K', status: 'SCHEDULED' },
];

export const mockPredictions: Array<PredictionRecord & { fixtureId: string }> = [];

export function dashboardModel(now = new Date()) {
  const order = dailyOrder(now);
  return { now, referenceRotationDate, timezone: 'Asia/Dubai', order, players, fixtures, predictions: mockPredictions };
}
