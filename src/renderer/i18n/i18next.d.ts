import 'i18next';
import type en from './en.json';

// Makes every t('...') key checked at compile time against the English file.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
