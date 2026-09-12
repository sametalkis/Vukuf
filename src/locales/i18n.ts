import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './tr';
import en from './en';

export const resources = {
  tr: { translation: tr },
  en: { translation: en },
};

export function getInitialLanguage(): 'tr' | 'en' {
  if (typeof window === 'undefined') return 'tr';
  try {
    const raw = localStorage.getItem('simple-time-tracker');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.state?.language === 'en' || parsed.state?.language === 'tr') {
        return parsed.state.language;
      }
    }
  } catch {}
  return navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

const initialLang = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLang,
    fallbackLng: 'tr',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
