import { describe, expect, it } from 'vitest';
import { parseAmount, parseInteger } from '@shared/parseNumber';

const IQD = 0;
const USD = 2;

describe('parseAmount', () => {
  it.each([
    ['250000', 250000],
    ['250,000', 250000],
    ['١٢٣', 123],
    ['۱۲۳', 123],
    ['٢٥٠٬٠٠٠', 250000],
    ['٢٥٠،٠٠٠', 250000],
    ['  1,250,000 ', 1250000],
    ['1\u00A0250', 1250],
    ['\u200F250,000\u200F', 250000],
    ['0', 0],
    ['007', 7],
  ])('reads IQD %j as %d', (input, expected) => {
    expect(parseAmount(input, IQD)).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['12.30', 1230],
    ['12.3', 1230],
    ['12', 1200],
    ['0.05', 5],
    ['1,234.56', 123456],
    ['١٢٫٣٠', 1230],
    ['۱۲.۵', 1250],
  ])('reads USD %j as %d cents with exact integer arithmetic', (input, expected) => {
    expect(parseAmount(input, USD)).toEqual({ ok: true, value: expected });
  });

  it('never loses a cent to floating point', () => {
    // 0.1 + 0.2 style errors: 1.15 * 100 is 114.99999999999999 in floating point.
    expect(parseAmount('1.15', USD)).toEqual({ ok: true, value: 115 });
    expect(parseAmount('4.35', USD)).toEqual({ ok: true, value: 435 });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['-5', 'negative'],
    ['\u22125', 'negative'],
    ['abc', 'invalid'],
    ['12a', 'invalid'],
    ['1.2.3', 'invalid'],
    ['1,5', 'invalid'],
    ['12,34,567', 'invalid'],
    [',000', 'invalid'],
    ['5.', 'invalid'],
    ['.5', 'invalid'],
  ])('rejects %j as %s', (input, error) => {
    expect(parseAmount(input, USD)).toEqual({ ok: false, error });
  });

  it('rejects decimals that the currency does not have instead of guessing', () => {
    expect(parseAmount('1.000', IQD)).toEqual({ ok: false, error: 'too_many_decimals' });
    expect(parseAmount('12.345', USD)).toEqual({ ok: false, error: 'too_many_decimals' });
  });

  it('rejects numbers too large to stay exact', () => {
    expect(parseAmount('1234567890123456', IQD)).toEqual({ ok: false, error: 'too_large' });
    expect(parseAmount('123456789012345', IQD)).toEqual({ ok: true, value: 123456789012345 });
  });
});

describe('parseInteger', () => {
  it('reads whole numbers in any digit style', () => {
    expect(parseInteger('٢٠٢٦')).toEqual({ ok: true, value: 2026 });
    expect(parseInteger('12')).toEqual({ ok: true, value: 12 });
    expect(parseInteger('1.5')).toEqual({ ok: false, error: 'too_many_decimals' });
  });
});
