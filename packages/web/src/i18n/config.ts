import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';

export const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'pt'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  pt: 'Português',
};

const LOCALE_KEY = 'tag.locale';

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function getStoredLocale(): SupportedLocale | null {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    return isSupportedLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function setStoredLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Per-viewer convenience only — a private window or blocked storage just falls back to
    // the browser language every load, which is a perfectly fine default.
  }
}

function detectInitialLocale(): SupportedLocale {
  const stored = getStoredLocale();
  if (stored) return stored;
  const browserLang = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'fr';
  return isSupportedLocale(browserLang) ? browserLang : 'fr';
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    es: { translation: es },
    pt: { translation: pt },
  },
  lng: detectInitialLocale(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export function changeLocale(locale: SupportedLocale): void {
  setStoredLocale(locale);
  i18n.changeLanguage(locale);
}

export default i18n;
