import { describe, expect, it } from 'vitest';
import ar from '../../src/renderer/i18n/ar.json';
import ckb from '../../src/renderer/i18n/ckb.json';
import en from '../../src/renderer/i18n/en.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') entries.set(path, value);
    else flatten(value, path).forEach((text, nested) => entries.set(nested, text));
  }
  return entries;
}

const languages = { ckb, en, ar } as Record<string, Tree>;
const englishKeys = [...flatten(en).keys()].sort();

describe('translations', () => {
  it.each(Object.keys(languages))('%s has exactly the same keys as English', (language) => {
    expect([...flatten(languages[language] ?? {}).keys()].sort()).toEqual(englishKeys);
  });

  it.each(Object.keys(languages))('%s has no empty text', (language) => {
    for (const [key, text] of flatten(languages[language] ?? {})) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it.each(['ckb', 'ar'])('%s is really translated, not left in English', (language) => {
    const translated = flatten(languages[language] ?? {});
    const leftInEnglish = [...flatten(en)].filter(
      // Currency codes (IQD, USD) are written the same in every language, on purpose.
      ([key, text]) =>
        translated.get(key) === text && /[a-z]{3}/i.test(text) && !key.startsWith('currency.'),
    );
    expect(leftInEnglish).toEqual([]);
  });
});
