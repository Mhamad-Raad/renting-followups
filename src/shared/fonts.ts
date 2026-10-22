/**
 * The fonts bundled with the app (open licence, in src/renderer/fonts). Only
 * fonts that a test confirms contain every Sorani letter and the Arabic-Indic
 * digits are listed, so only those are offered in Settings.
 */
export const FONT_FAMILIES = [
  'noto-sans-arabic',
  'noto-naskh-arabic',
  'vazirmatn',
  'ibm-plex-sans-arabic',
  'amiri',
  'scheherazade-new',
] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

/** Each font's own name, shown as written (font names are not translated). */
export const FONT_NAMES: Record<FontFamily, string> = {
  'noto-sans-arabic': 'Noto Sans Arabic',
  'noto-naskh-arabic': 'Noto Naskh Arabic',
  vazirmatn: 'Vazirmatn',
  'ibm-plex-sans-arabic': 'IBM Plex Sans Arabic',
  amiri: 'Amiri',
  'scheherazade-new': 'Scheherazade New',
};

/** The letters Sorani needs beyond Arabic, and the Arabic-Indic digits; also the font sample in Settings. */
export const SORANI_TEST_TEXT = 'ڕ ڵ ۆ ێ ە ڤ پ چ ژ گ ک ١٢٣٤٥٦٧٨٩٠';
