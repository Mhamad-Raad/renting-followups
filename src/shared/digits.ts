/** How numbers are displayed everywhere: Western (1 2 3) or Arabic-Indic (١ ٢ ٣). */
export const DIGIT_STYLES = ['western', 'arabic'] as const;
export type DigitStyle = (typeof DIGIT_STYLES)[number];

const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;
const WESTERN_ZERO = 0x30;

/** Separators used when displaying numbers in each digit style. */
export const SEPARATORS: Record<DigitStyle, { thousands: string; decimal: string }> = {
  western: { thousands: ',', decimal: '.' },
  arabic: { thousands: '\u066C', decimal: '\u066B' },
};

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Western digits; other characters are kept. */
export function toWesternDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const zero = code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_INDIC_ZERO;
    return String.fromCharCode(WESTERN_ZERO + code - zero);
  });
}

/** Writes the Western digits of `text` in the given digit style. */
export function toDigitStyle(text: string, style: DigitStyle): string {
  if (style === 'western') return text;
  return text.replace(/[0-9]/g, (digit) =>
    String.fromCharCode(ARABIC_INDIC_ZERO + digit.charCodeAt(0) - WESTERN_ZERO),
  );
}
