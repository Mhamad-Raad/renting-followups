import { toWesternDigits } from './digits';

// Harakat, superscript alef, Quranic marks, tatweel, and invisible joiners and direction marks.
const IGNORED_MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200B-\u200F\u061C\uFEFF]/g;

// Letters that people type interchangeably on Arabic and Kurdish keyboards.
const LETTER_EQUIVALENTS = new Map<string, string>([
  ['\u064A', '\u06CC'], // ي Arabic yeh → ی Kurdish yeh
  ['\u0649', '\u06CC'], // ى alef maksura → ی
  ['\u0643', '\u06A9'], // ك Arabic kaf → ک Kurdish kaf
  ['\u0647', '\u06D5'], // ه heh → ە ae
  ['\u06BE', '\u06D5'], // ھ heh doachashmee → ە
  ['\u0629', '\u06D5'], // ة teh marbuta → ە
  ['\u0623', '\u0627'], // أ → ا
  ['\u0625', '\u0627'], // إ → ا
  ['\u0622', '\u0627'], // آ → ا
  ['\u0671', '\u0627'], // ٱ → ا
]);
const EQUIVALENT_LETTER = new RegExp(`[${[...LETTER_EQUIVALENTS.keys()].join('')}]`, 'g');

/**
 * Builds the search form of a name or phone number. Stored copies
 * (`name_normalized`, `full_name_normalized`) and every search query go through
 * this one function, so they always match the same way.
 */
export function normalizeText(text: string): string {
  return toWesternDigits(text.normalize('NFKC'))
    .replace(IGNORED_MARKS, '')
    .replace(EQUIVALENT_LETTER, (letter) => LETTER_EQUIVALENTS.get(letter) ?? letter)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The digits of a phone number in Western form, so "٠٧٥٠ 123-45" and "075012345" match. */
export function normalizePhone(phone: string): string {
  return toWesternDigits(phone).replace(/\D/g, '');
}
