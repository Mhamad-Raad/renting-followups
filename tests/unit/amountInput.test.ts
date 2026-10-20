import { describe, expect, it } from 'vitest';
import {
  amountInputText,
  caretAfterSignificant,
  formatAmountInput,
  significantBefore,
} from '@shared/amountInput';

describe('formatAmountInput', () => {
  it.each([
    ['', '', null],
    ['1', '1', 1],
    ['1250', '1,250', 1250],
    ['1250000', '1,250,000', 1250000],
    ['1,25000', '125,000', 125000],
    ['١٢٥٠٠٠', '125,000', 125000],
    ['007', '7', 7],
  ])('IQD: typing %j shows %j', (raw, text, value) => {
    expect(formatAmountInput(raw, 0, 'western')).toEqual({ text, value });
  });

  it.each([
    ['12.', '12.', 1200],
    ['12.3', '12.3', 1230],
    ['1234.56', '1,234.56', 123456],
    ['.5', '0.5', 50],
    ['١٢٫٥', '12.5', 1250],
  ])('USD: typing %j shows %j', (raw, text, value) => {
    expect(formatAmountInput(raw, 2, 'western')).toEqual({ text, value });
  });

  it('shows Arabic-Indic digits and separators when that style is chosen', () => {
    expect(formatAmountInput('1250000', 0, 'arabic')).toEqual({
      text: '١٬٢٥٠٬٠٠٠',
      value: 1250000,
    });
    expect(formatAmountInput('1234.5', 2, 'arabic')?.text).toBe('١٬٢٣٤٫٥');
  });

  it.each([
    ['12a', 0],
    ['1.5', 0],
    ['1.234', 2],
    ['1.2.3', 2],
    ['-5', 0],
    ['12345678901234', 0],
  ])('ignores the keystroke that makes %j', (raw, digits) => {
    expect(formatAmountInput(raw, digits, 'western')).toBeNull();
  });
});

describe('amountInputText', () => {
  it('shows a stored amount for editing', () => {
    expect(amountInputText(1250000, 0, 'western')).toBe('1,250,000');
    expect(amountInputText(123456, 2, 'western')).toBe('1,234.56');
    expect(amountInputText(5, 2, 'western')).toBe('0.05');
    expect(amountInputText(null, 0, 'western')).toBe('');
  });
});

describe('cursor position', () => {
  it('stays after the same digit when separators are added', () => {
    // Typing the 4th digit into "123|" gives "1,234": the cursor belongs after the 4.
    const typed = '1234';
    const count = significantBefore(typed, 4);
    expect(caretAfterSignificant('1,234', count)).toBe(5);
    // Cursor after the "2" in "1,2|34" stays after the "2" in the new text.
    expect(caretAfterSignificant('12,345', significantBefore('1,2345', 3))).toBe(2);
    expect(caretAfterSignificant('1,234', 0)).toBe(0);
  });
});
