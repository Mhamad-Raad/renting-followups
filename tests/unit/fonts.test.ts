import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';
import { describe, expect, it } from 'vitest';
import { FONT_FAMILIES, FONT_NAMES, SORANI_TEST_TEXT } from '@shared/fonts';

const fontsDirectory = join(import.meta.dirname, '../../src/renderer/fonts');
const css = readFileSync(join(import.meta.dirname, '../../src/renderer/styles/fonts.css'), 'utf8');
const required = [...SORANI_TEST_TEXT.replace(/\s/g, '')];

describe.each(FONT_FAMILIES)('font %s', (family) => {
  it.each([400, 700])('has every Sorani letter and Arabic-Indic digit at weight %i', (weight) => {
    const font = fontkit.openSync(join(fontsDirectory, family, `arabic-${weight}.woff2`));
    const missing = required.filter(
      (letter) => !font.hasGlyphForCodePoint(letter.codePointAt(0) ?? 0),
    );
    expect(missing).toEqual([]);
  });

  it('ships its open font licence', () => {
    expect(readFileSync(join(fontsDirectory, family, 'OFL.txt'), 'utf8')).toContain(
      'SIL Open Font License',
    );
  });

  it('is loaded and selectable in fonts.css', () => {
    for (const file of ['arabic-400', 'arabic-700', 'latin-400', 'latin-700']) {
      expect(existsSync(join(fontsDirectory, family, `${file}.woff2`))).toBe(true);
      expect(css).toContain(`../fonts/${family}/${file}.woff2`);
    }
    expect(css).toContain(`:root[data-font='${family}']`);
    expect(css).toContain(`--font-family: '${FONT_NAMES[family]}'`);
  });
});

it('fonts.css offers no font outside the tested list', () => {
  const offered = [...css.matchAll(/data-font='([\w-]+)'/g)].map((match) => match[1]);
  expect(offered).toEqual([...FONT_FAMILIES]);
});
