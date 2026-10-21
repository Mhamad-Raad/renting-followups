import { SEPARATORS, toDigitStyle, toWesternDigits, type DigitStyle } from './digits';

const MAX_INTEGER_DIGITS = 13;
// Spaces, thousands separators and invisible direction marks are dropped while typing.
const DROPPED = /[\s\u00A0\u202F\u200E\u200F\u061C,\u066C\u060C]/g;
// Characters that count when keeping the cursor in place: digits of any style and decimal marks.
const SIGNIFICANT_CHARACTER = /[0-9\u0660-\u0669\u06F0-\u06F9.\u066B]/;
const SIGNIFICANT_CHARACTERS = new RegExp(SIGNIFICANT_CHARACTER.source, 'g');

export interface AmountInput {
  /** What the box shows: grouped thousands, in the chosen digit style. */
  text: string;
  /** The amount in minor units, or null while the box is empty. */
  value: number | null;
}

/**
 * Re-formats an amount box after each keystroke. Returns null when the
 * keystroke cannot be part of an amount (a letter, a second decimal mark,
 * too many decimals), so the box simply keeps its previous text.
 */
export function formatAmountInput(
  raw: string,
  fractionDigits: number,
  style: DigitStyle,
): AmountInput | null {
  const plain = toWesternDigits(raw)
    .replace(DROPPED, '')
    .replace(/\u066B/g, '.');
  if (plain === '') return { text: '', value: null };
  const match = /^(\d*)(?:(\.)(\d*))?$/.exec(plain);
  if (!match) return null;
  const [, integerRaw = '', point, fraction = ''] = match;
  if (point && fractionDigits === 0) return null;
  if (fraction.length > fractionDigits) return null;
  const integer = integerRaw.replace(/^0+(?=\d)/, '');
  if (integer.length > MAX_INTEGER_DIGITS) return null;

  const { thousands, decimal } = SEPARATORS[style];
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  const text = toDigitStyle(point ? `${grouped || '0'}${decimal}${fraction}` : grouped, style);
  const value = Number((integer || '0') + fraction.padEnd(fractionDigits, '0'));
  return { text, value };
}

/** Shows a stored amount in an amount box (no currency name). */
export function amountInputText(
  value: number | null,
  fractionDigits: number,
  style: DigitStyle,
): string {
  if (value === null) return '';
  const digits = String(value).padStart(fractionDigits + 1, '0');
  const integer = digits.slice(0, digits.length - fractionDigits);
  const fraction = digits.slice(digits.length - fractionDigits);
  const raw = fractionDigits > 0 ? `${integer}.${fraction}` : integer;
  return formatAmountInput(raw, fractionDigits, style)?.text ?? '';
}

/** How many digits and decimal marks come before position `caret` in `text`. */
export function significantBefore(text: string, caret: number): number {
  return (text.slice(0, caret).match(SIGNIFICANT_CHARACTERS) ?? []).length;
}

/** The position just after the `count`-th digit or decimal mark, so the cursor stays where the owner was typing. */
export function caretAfterSignificant(text: string, count: number): number {
  if (count === 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (SIGNIFICANT_CHARACTER.test(text[index] ?? '')) seen += 1;
    if (seen === count) return index + 1;
  }
  return text.length;
}
