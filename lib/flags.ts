// Shared flag emojis keyed by our display team names. Falls back to ⚽ for
// anything unmapped (see flag()).
export const FLAG: Record<string, string> = {
  // Hosts & majors
  'Mexico': '🇲🇽', 'United States': '🇺🇸', 'USA': '🇺🇸', 'Canada': '🇨🇦',
  'Brazil': '🇧🇷', 'Argentina': '🇦🇷', 'France': '🇫🇷', 'Germany': '🇩🇪',
  'Spain': '🇪🇸', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Portugal': '🇵🇹', 'Netherlands': '🇳🇱',
  'Belgium': '🇧🇪', 'Italy': '🇮🇹', 'Croatia': '🇭🇷', 'Switzerland': '🇨🇭',
  // Rest of field
  'South Africa': '🇿🇦', 'Morocco': '🇲🇦', 'Japan': '🇯🇵', 'South Korea': '🇰🇷',
  'Saudi Arabia': '🇸🇦', 'Senegal': '🇸🇳', 'Ghana': '🇬🇭', 'Nigeria': '🇳🇬',
  'Ecuador': '🇪🇨', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴', 'Chile': '🇨🇱',
  'Costa Rica': '🇨🇷', 'Honduras': '🇭🇳', 'Panama': '🇵🇦', 'Qatar': '🇶🇦',
  'Iran': '🇮🇷', 'IR Iran': '🇮🇷', 'Turkey': '🇹🇷', 'Türkiye': '🇹🇷',
  'Poland': '🇵🇱', 'Denmark': '🇩🇰', 'Serbia': '🇷🇸', 'Ukraine': '🇺🇦',
  'Romania': '🇷🇴', 'New Zealand': '🇳🇿', 'Australia': '🇦🇺',
  'Cabo Verde': '🇨🇻', 'Cape Verde Islands': '🇨🇻', 'Egypt': '🇪🇬',
  'Iraq': '🇮🇶', 'Norway': '🇳🇴', 'Algeria': '🇩🇿', 'Austria': '🇦🇹',
  'Jordan': '🇯🇴', 'DR Congo': '🇨🇩', 'Congo DR': '🇨🇩', 'Uzbekistan': '🇺🇿',
  'Czechia': '🇨🇿', 'Czech Republic': '🇨🇿', 'Bosnia and Herzegovina': '🇧🇦',
  'Bosnia & Herzegovina': '🇧🇦', 'Paraguay': '🇵🇾', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Sweden': '🇸🇪', 'Tunisia': '🇹🇳', 'Haiti': '🇭🇹', 'Curaçao': '🇨🇼',
  'Ivory Coast': '🇨🇮', "Côte d'Ivoire": '🇨🇮', 'Cameroon': '🇨🇲',
  'Mali': '🇲🇱', 'Greece': '🇬🇷', 'Hungary': '🇭🇺', 'Slovakia': '🇸🇰',
  'Slovenia': '🇸🇮', 'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Peru': '🇵🇪', 'Venezuela': '🇻🇪',
  'Bolivia': '🇧🇴', 'Jamaica': '🇯🇲', 'El Salvador': '🇸🇻', 'Guatemala': '🇬🇹',
  'Oman': '🇴🇲', 'United Arab Emirates': '🇦🇪', 'UAE': '🇦🇪', 'Bahrain': '🇧🇭',
  'China': '🇨🇳', 'Indonesia': '🇮🇩', 'Thailand': '🇹🇭', 'Vietnam': '🇻🇳',
  'New Caledonia': '🇳🇨', 'Suriname': '🇸🇷', 'Angola': '🇦🇴', 'Zambia': '🇿🇲',
};

export function flag(team: string): string {
  return FLAG[team] ?? '⚽';
}
