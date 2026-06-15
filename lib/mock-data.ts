import { dailyOrder, referenceRotationDate, type PredictionRecord } from './domain';

export const players = [
  { id: 'nicolas', name: 'Nicolas', avatarUrl: '/avatars/nicolas.svg', totalPoints: 0 },
  { id: 'jean', name: 'Jean', avatarUrl: '/avatars/jean.svg', totalPoints: 0 },
  { id: 'anthony', name: 'Anthony', avatarUrl: '/avatars/anthony.svg', totalPoints: 0 },
];

const teamSquads: Record<string, string[]> = {
  Spain: [
    'Unai Simón', 'David Raya', 'Álex Remiro', 'Dani Carvajal', 'Pedro Porro', 'Robin Le Normand', 'Aymeric Laporte', 'Pau Cubarsí', 'Dani Vivian', 'Alejandro Grimaldo', 'Marc Cucurella', 'Rodri', 'Martín Zubimendi', 'Fabián Ruiz', 'Mikel Merino', 'Pedri', 'Gavi', 'Dani Olmo', 'Fermín López', 'Nico Williams', 'Lamine Yamal', 'Ferran Torres', 'Álvaro Morata', 'Mikel Oyarzabal', 'Joselu', 'Álex Baena',
  ],
  'Cabo Verde': [
    'Vozinha', 'Márcio Rosa', 'Bruno Varela', 'Steven Moreira', 'Roberto Lopes', 'Logan Costa', 'Dylan Tavares', 'João Paulo Fernandes', 'Deroy Duarte', 'Patrick Andrade', 'Kevin Pina', 'Jamiro Monteiro', 'Larós Duarte', 'Bebé', 'Garry Rodrigues', 'Ryan Mendes', 'Jovane Cabral', 'Willy Semedo', 'Dailon Livramento', 'Hélio Varela', 'Gilson Tavares', 'Duk', 'Benchimol', 'Telmo Arcanjo', 'Cuca', 'Stopira',
  ],
  Belgium: [
    'Thibaut Courtois', 'Koen Casteels', 'Matz Sels', 'Timothy Castagne', 'Thomas Meunier', 'Arthur Theate', 'Wout Faes', 'Jan Vertonghen', 'Zeno Debast', 'Aster Vranckx', 'Amadou Onana', 'Youri Tielemans', 'Orel Mangala', 'Kevin De Bruyne', 'Leandro Trossard', 'Jérémy Doku', 'Dodi Lukebakio', 'Yannick Carrasco', 'Charles De Ketelaere', 'Loïs Openda', 'Romelu Lukaku', 'Johan Bakayoko', 'Michy Batshuayi', 'Arthur Vermeeren', 'Alexis Saelemaekers', 'Malick Fofana',
  ],
  Egypt: [
    'Mohamed El Shenawy', 'Mostafa Shobeir', 'Mohamed Awad', 'Mohamed Hani', 'Omar Kamal', 'Ahmed Hegazy', 'Mohamed Abdelmonem', 'Yasser Ibrahim', 'Ramy Rabia', 'Mohamed Hamdi', 'Ahmed Fatouh', 'Hamdi Fathy', 'Marwan Attia', 'Emam Ashour', 'Ahmed Sayed Zizo', 'Trézéguet', 'Omar Marmoush', 'Mohamed Salah', 'Mostafa Mohamed', 'Ibrahim Adel', 'Mostafa Fathi', 'Nasser Maher', 'Akram Tawfik', 'Mahmoud Saber', 'Mohamed Sherif', 'Ahmed Nabil Koka',
  ],
  'Saudi Arabia': [
    'Mohammed Al-Owais', 'Nawaf Al-Aqidi', 'Ahmed Al-Kassar', 'Saud Abdulhamid', 'Sultan Al-Ghannam', 'Ali Al-Bulaihi', 'Hassan Tambakti', 'Abdulelah Al-Amri', 'Yasser Al-Shahrani', 'Mohammed Al-Breik', 'Abdulelah Al-Malki', 'Mohamed Kanno', 'Nasser Al-Dawsari', 'Abdullah Otayf', 'Sami Al-Najei', 'Salem Al-Dawsari', 'Fahad Al-Muwallad', 'Hattan Bahebri', 'Abdulrahman Ghareeb', 'Firas Al-Buraikan', 'Saleh Al-Shehri', 'Abdullah Al-Hamdan', 'Ayman Yahya', 'Musab Al-Juwayr', 'Ali Lajami', 'Faisal Al-Ghamdi',
  ],
  Uruguay: [
    'Sergio Rochet', 'Fernando Muslera', 'Santiago Mele', 'José María Giménez', 'Ronald Araújo', 'Sebastián Cáceres', 'Mathías Olivera', 'Matías Viña', 'Guillermo Varela', 'Nahitan Nández', 'Manuel Ugarte', 'Federico Valverde', 'Rodrigo Bentancur', 'Giorgian De Arrascaeta', 'Nicolás De La Cruz', 'Facundo Pellistri', 'Brian Rodríguez', 'Maximiliano Araújo', 'Darwin Núñez', 'Luis Suárez', 'Edinson Cavani', 'Agustín Canobbio', 'Cristian Olivera', 'Matías Vecino', 'Lucas Torreira', 'Facundo Torres',
  ],
  'IR Iran': [
    'Alireza Beiranvand', 'Payam Niazmand', 'Hossein Hosseini', 'Sadegh Moharrami', 'Ramin Rezaeian', 'Morteza Pouraliganji', 'Shoja Khalilzadeh', 'Hossein Kanaanizadegan', 'Majid Hosseini', 'Milad Mohammadi', 'Ehsan Hajsafi', 'Saeid Ezatolahi', 'Omid Ebrahimi', 'Ahmad Nourollahi', 'Ali Gholizadeh', 'Saman Ghoddos', 'Mehdi Torabi', 'Vahid Amiri', 'Mehdi Taremi', 'Sardar Azmoun', 'Karim Ansarifard', 'Shahriar Moghanlou', 'Allahyar Sayyadmanesh', 'Alireza Jahanbakhsh', 'Mohammad Mohebi', 'Yasin Salmani',
  ],
  'New Zealand': [
    'Max Crocombe', 'Michael Woud', 'Alex Paulsen', 'Liberato Cacace', 'Tim Payne', 'Tommy Smith', 'Nando Pijnaker', 'Michael Boxall', 'Bill Tuiloma', 'Winston Reid', 'Joe Bell', 'Marko Stamenic', 'Matthew Garbett', 'Clayton Lewis', 'Sarpreet Singh', 'Callum McCowatt', 'Elijah Just', 'Ben Waine', 'Chris Wood', 'Kosta Barbarouses', 'Marco Rojas', 'Alex Greive', 'Logan Rogerson', 'Francis de Vries', 'Dane Ingham', 'Eli Just',
  ],
};

function matchSquads(homeTeam: string, awayTeam: string) {
  return {
    homeSquad: teamSquads[homeTeam] ?? [],
    awaySquad: teamSquads[awayTeam] ?? [],
    goalscorerOptions: [...(teamSquads[homeTeam] ?? []), ...(teamSquads[awayTeam] ?? [])],
  };
}

export const fixtures = [
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
    ...matchSquads('Spain', 'Cabo Verde'),
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
    ...matchSquads('Belgium', 'Egypt'),
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
    ...matchSquads('Saudi Arabia', 'Uruguay'),
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
    ...matchSquads('IR Iran', 'New Zealand'),
  },
];

export const mockPredictions: Array<PredictionRecord & { fixtureId: string }> = [];

export function dashboardModel(now = new Date('2026-06-15T10:00:00+04:00')) {
  const order = dailyOrder(now);
  return { now, referenceRotationDate, timezone: 'Asia/Dubai', order, players, fixtures, predictions: mockPredictions };
}
