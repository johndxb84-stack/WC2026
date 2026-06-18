const FLAG: Record<string, string> = {
  'Spain': '🇪🇸', 'Cabo Verde': '🇨🇻', 'Belgium': '🇧🇪', 'Egypt': '🇪🇬',
  'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾', 'IR Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'France': '🇫🇷', 'Senegal': '🇸🇳', 'Iraq': '🇮🇶', 'Norway': '🇳🇴',
  'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴',
  'Portugal': '🇵🇹', 'DR Congo': '🇨🇩', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷',
  'Ghana': '🇬🇭', 'Panama': '🇵🇦', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴',
  'Czechia': '🇨🇿', 'South Africa': '🇿🇦', 'Switzerland': '🇨🇭',
  'Bosnia and Herzegovina': '🇧🇦', 'Canada': '🇨🇦', 'Qatar': '🇶🇦',
  'Mexico': '🇲🇽', 'South Korea': '🇰🇷',
  'USA': '🇺🇸', 'Brazil': '🇧🇷', 'Germany': '🇩🇪', 'Netherlands': '🇳🇱',
  'Morocco': '🇲🇦', 'Japan': '🇯🇵', 'Australia': '🇦🇺', 'Türkiye': '🇹🇷',
  'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Ecuador': '🇪🇨', 'Paraguay': '🇵🇾', 'Haiti': '🇭🇹',
  'Curaçao': '🇨🇼', 'Côte d\'Ivoire': '🇨🇮', 'Serbia': '🇷🇸', 'Denmark': '🇩🇰',
  'Tunisia': '🇹🇳', 'Indonesia': '🇮🇩', 'Slovenia': '🇸🇮', 'Albania': '🇦🇱',
  'Cameroon': '🇨🇲', 'Nigeria': '🇳🇬', 'Costa Rica': '🇨🇷', 'Venezuela': '🇻🇪',
  'Honduras': '🇭🇳', 'Libya': '🇱🇾', 'Mauritania': '🇲🇷', 'Chad': '🇹🇩',
};

export function flag(team: string): string {
  return FLAG[team] ?? '⚽';
}
