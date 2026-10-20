import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_SETTINGS, type Language } from '@shared/settings';
import ar from './ar.json';
import ckb from './ckb.json';
import en from './en.json';

export const translations: Record<Language, typeof en> = { ckb, en, ar };

/** Sorani and Arabic read right to left; English left to right. */
export const LANGUAGE_DIRECTION: Record<Language, 'rtl' | 'ltr'> = {
  ckb: 'rtl',
  en: 'ltr',
  ar: 'rtl',
};

/** Each language is offered under its own name, so it can be found whatever is active. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ckb: 'کوردی',
  en: 'English',
  ar: 'العربية',
};

void i18next.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(translations).map(([language, strings]) => [language, { translation: strings }]),
  ),
  lng: DEFAULT_SETTINGS.language,
  fallbackLng: false,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18next };
