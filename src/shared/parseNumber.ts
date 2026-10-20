import { toWesternDigits } from './digits';

export type ParseError = 'empty' | 'invalid' | 'negative' | 'too_many_decimals' | 'too_large';
export type ParseResult = { ok: true; value: number } | { ok: false; error: ParseError };

/** Keeps every value well inside Number.MAX_SAFE_INTEGER, so integer arithmetic stays exact. */
const MAX_DIGITS = 15;

// Spaces of any kind and invisible direction marks, which appear when text is pasted from RTL documents.
const IGNORED_CHARACTERS = /[\s\u00A0\u202F\u200E\u200F\u061C]/g;
const THOUSANDS_SEPARATORS = /[,\u066C\u060C]/;
const DECIMAL_SEPARATORS = /[.\u066B]/g;
// Either no separators at all, or groups of exactly three digits after the first group.
const INTEGER_PART = /^(\d+|\d{1,3}(?:[,\u066C\u060C]\d{3})+)$/;

/**
 * Reads a typed amount and returns it as an integer in minor units, using only
 * string arithmetic (no floating point): "12.30" with 2 fraction digits is 1230.
 *
 * Accepts Western, Arabic-Indic and Persian digits; `,` `٬` `،` as thousands
 * separators; `.` `٫` as the decimal separator. Anything ambiguous is rejected
 * rather than guessed, so a mistyped amount is never silently saved as another
 * value (for example "1.000" for IQD is an error, not 1).
 */
export function parseAmount(input: string, fractionDigits: number): ParseResult {
  const text = toWesternDigits(input).replace(IGNORED_CHARACTERS, '');
  if (text === '') return { ok: false, error: 'empty' };
  if (/^[-\u2212]/.test(text)) return { ok: false, error: 'negative' };

  const [integerPart = '', fractionPart, ...rest] = text.split(DECIMAL_SEPARATORS);
  if (rest.length > 0) return { ok: false, error: 'invalid' };
  if (fractionPart !== undefined && !/^\d+$/.test(fractionPart)) {
    return { ok: false, error: 'invalid' };
  }
  if (!INTEGER_PART.test(integerPart)) return { ok: false, error: 'invalid' };

  const fraction = fractionPart ?? '';
  if (fraction.length > fractionDigits) return { ok: false, error: 'too_many_decimals' };

  const digits = (
    integerPart.split(THOUSANDS_SEPARATORS).join('') + fraction.padEnd(fractionDigits, '0')
  ).replace(/^0+(?=\d)/, '');
  if (digits.length > MAX_DIGITS) return { ok: false, error: 'too_large' };
  return { ok: true, value: Number(digits) };
}

/** Reads a whole number such as a year, a month or a count. */
export function parseInteger(input: string): ParseResult {
  return parseAmount(input, 0);
}
