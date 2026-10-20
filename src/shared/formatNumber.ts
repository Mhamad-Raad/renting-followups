import { SEPARATORS, toDigitStyle, type DigitStyle } from './digits';

function groupThousands(integerDigits: string, separator: string): string {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formats an integer amount in minor units for display, for example 123456 with
 * 2 fraction digits is "1,234.56". Our own formatter (not the locale) decides
 * the digits, so output is identical on every computer and in print and Excel.
 */
export function formatAmount(
  minorUnits: number,
  fractionDigits: number,
  style: DigitStyle,
): string {
  if (!Number.isSafeInteger(minorUnits)) throw new RangeError('Amount must be a safe integer');
  const { thousands, decimal } = SEPARATORS[style];
  const sign = minorUnits < 0 ? '-' : '';
  const digits = Math.abs(minorUnits)
    .toString()
    .padStart(fractionDigits + 1, '0');
  const integerDigits = digits.slice(0, digits.length - fractionDigits);
  const fraction = digits.slice(digits.length - fractionDigits);

  const grouped = groupThousands(integerDigits, thousands);
  const text = fractionDigits > 0 ? `${grouped}${decimal}${fraction}` : grouped;
  return sign + toDigitStyle(text, style);
}

/** Formats a whole number (a count, a year, a receipt number) without separators. */
export function formatPlain(value: number, style: DigitStyle): string {
  return toDigitStyle(String(value), style);
}
