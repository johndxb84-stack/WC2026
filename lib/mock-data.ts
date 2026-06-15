import { dailyOrder, referenceRotationDate } from './domain';

export const players = [
  { id: 'nicolas', name: 'Nicolas', avatarUrl: '/avatars/nicolas.svg', totalPoints: 0 },
  { id: 'jean', name: 'Jean', avatarUrl: '/avatars/jean.svg', totalPoints: 0 },
  { id: 'anthony', name: 'Anthony', avatarUrl: '/avatars/anthony.svg', totalPoints: 0 },
];

export const fixtures = [
  {
    id: 'match-12',
    homeTeam: 'Sweden',
    awayTeam: 'Tunisia',
    homeLogo: '🇸🇪',
    awayLogo: '🇹🇳',
    kickoff: new Date('2026-06-15T02:00:00+04:00'),
    venue: 'Monterrey Stadium',
    stage: 'Group F',
    status: 'FINISHED',
    goalscorerOptions: ['Yasin Ayari', 'Alexander Isak', 'Viktor Gyökeres', 'Omar Rekik'],
  },
  {
    id: 'match-14',
    homeTeam: 'Spain',
    awayTeam: 'Cabo Verde',
    homeLogo: '🇪🇸',
    awayLogo: '🇨🇻',
    kickoff: new Date('2026-06-15T20:00:00+04:00'),
    venue: 'Atlanta Stadium',
    stage: 'Group H',
    status: 'SCHEDULED',
    goalscorerOptions: ['Álvaro Morata', 'Ferran Torres', 'Pedri', 'Jamiro Monteiro'],
  },
  {
    id: 'match-16',
    homeTeam: 'Belgium',
    awayTeam: 'Egypt',
    homeLogo: '🇧🇪',
    awayLogo: '🇪🇬',
    kickoff: new Date('2026-06-16T02:00:00+04:00'),
    venue: 'Seattle Stadium',
    stage: 'Group G',
    status: 'SCHEDULED',
    goalscorerOptions: ['Romelu Lukaku', 'Kevin De Bruyne', 'Mohamed Salah', 'Mostafa Mohamed'],
  },
  {
    id: 'match-13',
    homeTeam: 'Saudi Arabia',
    awayTeam: 'Uruguay',
    homeLogo: '🇸🇦',
    awayLogo: '🇺🇾',
    kickoff: new Date('2026-06-16T02:00:00+04:00'),
    venue: 'Miami Stadium',
    stage: 'Group H',
    status: 'SCHEDULED',
    goalscorerOptions: ['Salem Al-Dawsari', 'Firas Al-Buraikan', 'Darwin Núñez', 'Federico Valverde'],
  },
  {
    id: 'match-15',
    homeTeam: 'IR Iran',
    awayTeam: 'New Zealand',
    homeLogo: '🇮🇷',
    awayLogo: '🇳🇿',
    kickoff: new Date('2026-06-16T05:00:00+04:00'),
    venue: 'Los Angeles Stadium',
    stage: 'Group G',
    status: 'SCHEDULED',
    goalscorerOptions: ['Mehdi Taremi', 'Sardar Azmoun', 'Chris Wood', 'Matthew Garbett'],
  },
];

export const mockPredictions = [
  { fixtureId: 'match-12', userName: 'Nicolas', homeScore: 2, awayScore: 1, submittedAt: new Date('2026-06-15T00:20:00+04:00') },
  { fixtureId: 'match-12', userName: 'Jean', homeScore: 1, awayScore: 1, submittedAt: new Date('2026-06-15T00:35:00+04:00') },
];

export function dashboardModel(now = new Date('2026-06-15T10:00:00+04:00')) {
  const order = dailyOrder(now);
  return { now, referenceRotationDate, timezone: 'Asia/Dubai', order, players, fixtures, predictions: mockPredictions };
}
