export interface LanguageItem {
  code: string;
  name: string;          // Native name (e.g. "Türkçe", "English", "Deutsch")
  englishName: string;   // English name (e.g. "Turkish", "English", "German")
  region: string;        // Region / Country
  flag: string;          // Flag emoji or identifier
  badge: string;         // ISO uppercase 2-letter badge
  available: boolean;    // Fully supported in app
}

export const LANGUAGES: LanguageItem[] = [
  {
    code: 'tr',
    name: 'Türkçe',
    englishName: 'Turkish',
    region: 'Türkiye',
    flag: '🇹🇷',
    badge: 'TR',
    available: true,
  },
  {
    code: 'en',
    name: 'English',
    englishName: 'English',
    region: 'United States / Global',
    flag: '🇬🇧',
    badge: 'EN',
    available: true,
  },
  {
    code: 'de',
    name: 'Deutsch',
    englishName: 'German',
    region: 'Deutschland',
    flag: '🇩🇪',
    badge: 'DE',
    available: false,
  },
  {
    code: 'es',
    name: 'Español',
    englishName: 'Spanish',
    region: 'España / América Latina',
    flag: '🇪🇸',
    badge: 'ES',
    available: false,
  },
  {
    code: 'fr',
    name: 'Français',
    englishName: 'French',
    region: 'France',
    flag: '🇫🇷',
    badge: 'FR',
    available: false,
  },
  {
    code: 'ja',
    name: '日本語',
    englishName: 'Japanese',
    region: '日本',
    flag: '🇯🇵',
    badge: 'JA',
    available: false,
  },
  {
    code: 'ru',
    name: 'Русский',
    englishName: 'Russian',
    region: 'Россия',
    flag: 'RU',
    badge: 'RU',
    available: false,
  },
  {
    code: 'ar',
    name: 'العربية',
    englishName: 'Arabic',
    region: 'العالم العربي',
    flag: '🇸🇦',
    badge: 'AR',
    available: false,
  },
];

export function getLanguageByCode(code: string): LanguageItem {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];
}
