import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_COLORS } from '@shared/settings';

const css = readFileSync(join(import.meta.dirname, '../../src/renderer/styles/themes.css'), 'utf8');

/** The `--name: #rrggbb` values inside the block whose selector contains `selector`. */
function themeColors(selector: string): Map<string, string> {
  const block = css.split('}').find((part) => part.includes(selector));
  if (!block) throw new Error(`No theme block for ${selector}`);
  const colors = new Map<string, string>();
  for (const match of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    if (match[1] && match[2]) colors.set(match[1], match[2]);
  }
  return colors;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

/** WCAG 2 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const sector =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}

// Foreground on background pairs that carry text; WCAG AA asks for 4.5:1.
const TEXT_PAIRS: [string, string][] = [
  ['color-text', 'color-background'],
  ['color-text', 'color-surface'],
  ['color-text', 'color-surface-muted'],
  ['color-text', 'color-accent-soft'],
  ['color-text-muted', 'color-background'],
  ['color-text-muted', 'color-surface'],
  ['color-accent', 'color-surface'],
  ['color-on-accent', 'color-accent'],
  ['color-on-accent', 'color-danger'],
  ['status-paid', 'status-paid-bg'],
  ['status-due', 'status-due-bg'],
  ['status-late', 'status-late-bg'],
  ['status-upcoming', 'status-upcoming-bg'],
  ['status-na', 'status-na-bg'],
];

// Edges of controls; WCAG asks for 3:1 for parts of controls.
const CONTROL_PAIRS: [string, string][] = [
  ['color-control-border', 'color-surface'],
  ['color-control-border', 'color-background'],
];

// The focus ring and a focused field's edge are drawn in the theme colour.
const FOCUS_PAIRS: [string, string][] = [
  ['color-accent', 'color-surface'],
  ['color-accent', 'color-background'],
];

/** The colours a theme colour gives the accent tokens, as themes.css maps them. */
function withAccent(colors: Map<string, string>, accent: string): Map<string, string> {
  const result = new Map(colors);
  for (const [token, suffix] of [
    ['color-accent', ''],
    ['color-accent-hover', '-hover'],
    ['color-accent-soft', '-soft'],
    ['color-on-accent', '-on'],
  ] as const) {
    const value = colors.get(`accent-${accent}${suffix}`);
    if (value) result.set(token, value);
  }
  return result;
}

it.each(THEME_COLORS)('themes.css maps theme colour %s onto the accent', (accent) => {
  const selector =
    accent === 'blue' ? ':root,\n:root[data-accent' : `:root[data-accent='${accent}']`;
  const block = css.split('}').find((part) => part.includes(selector)) ?? '';
  expect(block).toContain(`--color-accent: var(--accent-${accent});`);
  expect(block).toContain(`--color-on-accent: var(--accent-${accent}-on);`);
});

describe.each([
  ['light', ":root[data-theme='light']"],
  ['dark', ":root[data-theme='dark']"],
])('%s theme', (_name, selector) => {
  const base = themeColors(selector);

  describe.each(THEME_COLORS)('with theme colour %s', (accent) => {
    const colors = withAccent(base, accent);
    const color = (name: string) => {
      const value = colors.get(name);
      if (!value) throw new Error(`Missing colour --${name}`);
      return value;
    };

    it.each(TEXT_PAIRS)('%s on %s is readable (at least 4.5:1)', (foreground, background) => {
      expect(contrast(color(foreground), color(background))).toBeGreaterThanOrEqual(4.5);
    });

    it.each(FOCUS_PAIRS)('focus in %s on %s is easy to see (at least 3:1)', (part, background) => {
      expect(contrast(color(part), color(background))).toBeGreaterThanOrEqual(3);
    });
  });

  it.each(CONTROL_PAIRS)('%s on %s is easy to see (at least 3:1)', (part, background) => {
    const [a, b] = [base.get(part), base.get(background)];
    if (!a || !b) throw new Error(`Missing colour --${part} or --${background}`);
    expect(contrast(a, b)).toBeGreaterThanOrEqual(3);
  });

  it('keeps paid, due and late clearly different colours', () => {
    const hues = ['status-paid', 'status-due', 'status-late'].map((name) => {
      const value = base.get(name);
      if (!value) throw new Error(`Missing colour --${name}`);
      return hue(value);
    });
    for (let i = 0; i < hues.length; i += 1) {
      for (let j = i + 1; j < hues.length; j += 1) {
        const gap = Math.abs((hues[i] ?? 0) - (hues[j] ?? 0));
        expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(25);
      }
    }
  });
});
