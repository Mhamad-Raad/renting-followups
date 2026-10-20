import { describe, expect, it } from 'vitest';
import { formatAmount, formatPlain } from '@shared/formatNumber';
import { parseAmount } from '@shared/parseNumber';

describe('formatAmount', () => {
  it.each([
    [0, 0, '0'],
    [999, 0, '999'],
    [1000, 0, '1,000'],
    [250000, 0, '250,000'],
    [1234567890, 0, '1,234,567,890'],
    [0, 2, '0.00'],
    [5, 2, '0.05'],
    [1230, 2, '12.30'],
    [123456, 2, '1,234.56'],
    [-250000, 0, '-250,000'],
  ])('formats %d with %d decimals as %j', (value, decimals, expected) => {
    expect(formatAmount(value, decimals, 'western')).toBe(expected);
  });

  it('uses Arabic-Indic digits and separators', () => {
    expect(formatAmount(250000, 0, 'arabic')).toBe('٢٥٠٬٠٠٠');
    expect(formatAmount(123456, 2, 'arabic')).toBe('١٬٢٣٤٫٥٦');
  });

  it('round-trips through parseAmount in both digit styles', () => {
    for (const style of ['western', 'arabic'] as const) {
      for (const [value, decimals] of [
        [1234567, 0],
        [123456, 2],
        [7, 2],
      ] as const) {
        expect(parseAmount(formatAmount(value, decimals, style), decimals)).toEqual({
          ok: true,
          value,
        });
      }
    }
  });

  it('refuses non-integer input', () => {
    expect(() => formatAmount(1.5, 2, 'western')).toThrow(RangeError);
  });
});

describe('formatPlain', () => {
  it('writes years and receipt numbers without separators', () => {
    expect(formatPlain(2026, 'western')).toBe('2026');
    expect(formatPlain(2026, 'arabic')).toBe('٢٠٢٦');
  });
});
