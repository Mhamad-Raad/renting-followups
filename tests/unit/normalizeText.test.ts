import { describe, expect, it } from 'vitest';
import { normalizePhone, normalizeText } from '@shared/normalizeText';

describe('normalizeText', () => {
  it.each([
    ['Arabic yeh and Kurdish yeh', 'علي', 'علی'],
    ['alef maksura and Kurdish yeh', 'مصطفى', 'مصطفی'],
    ['Arabic kaf and Kurdish kaf', 'كاروان', 'کاروان'],
    ['heh and ae', 'خانه', 'خانە'],
    ['teh marbuta and ae', 'فاطمة', 'فاطمە'],
    ['heh doachashmee and ae', 'ھەولێر', 'هەولێر'],
    ['hamza forms of alef', 'أحمد', 'احمد'],
  ])('treats %s as the same letter', (_name, a, b) => {
    expect(normalizeText(a)).toBe(normalizeText(b));
  });

  it('ignores diacritics and tatweel', () => {
    expect(normalizeText('م\u064Fح\u064Eم\u064E\u0651د')).toBe(normalizeText('محمد'));
    expect(normalizeText('م\u0640ح\u0640م\u0640د')).toBe(normalizeText('محمد'));
  });

  it('ignores zero-width joiners and direction marks', () => {
    expect(normalizeText('خانە\u200Cکان')).toBe(normalizeText('خانەکان'));
    expect(normalizeText('\u200F0750\u200F')).toBe('0750');
  });

  it('keeps Sorani letters that are really different', () => {
    expect(normalizeText('ڕ')).not.toBe(normalizeText('ر'));
    expect(normalizeText('ڵ')).not.toBe(normalizeText('ل'));
    expect(normalizeText('ۆ')).not.toBe(normalizeText('و'));
    expect(normalizeText('ێ')).not.toBe(normalizeText('ی'));
  });

  it('turns every digit style into Western digits', () => {
    expect(normalizeText('٠٧٥٠')).toBe('0750');
    expect(normalizeText('۰۷۵۰')).toBe('0750');
  });

  it('lowercases Latin text and collapses spaces', () => {
    expect(normalizeText('  Main   Street  ')).toBe('main street');
  });

  it('matches Arabic presentation forms to their base letters', () => {
    expect(normalizeText('ﻣﺤﻤﺪ')).toBe(normalizeText('محمد'));
  });
});

describe('normalizePhone', () => {
  it('keeps only the digits, in Western form', () => {
    expect(normalizePhone('٠٧٥٠ 123-45 67')).toBe('07501234567');
    expect(normalizePhone('+964 (750) 123')).toBe('964750123');
    expect(normalizePhone('')).toBe('');
  });
});
