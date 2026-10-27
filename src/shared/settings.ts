import { z } from 'zod';
import { DIGIT_STYLES } from './digits';
import { FONT_FAMILIES } from './fonts';
import { DEFAULT_REMIND_DAYS } from './notifications';

export const LANGUAGES = ['ckb', 'en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEME_MODES = ['light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const FONT_SIZES = ['extraSmall', 'small', 'normal', 'large', 'extraLarge'] as const;
export type FontSize = (typeof FONT_SIZES)[number];

/** Ready-made theme colours; none is green, orange or red, so they never look like a month status. */
export const THEME_COLORS = [
  'green',
  'blue',
  'teal',
  'indigo',
  'purple',
  'brown',
  'slate',
] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

/** The choices offered for "days before month end"; any whole number in range is accepted. */
export const REMIND_DAY_CHOICES = [3, 5, 7, 10, 14] as const;
export const REMIND_DAYS_MAX = 28;

export const PRINT_TITLE_MAX = 80;

/** The largest logo picture accepted; a logo is printed small, so this is plenty. */
export const LOGO_MAX_MEGABYTES = 2;
export const LOGO_MAX_BYTES = LOGO_MAX_MEGABYTES * 1024 * 1024;

export type LogoChoiceResult =
  { ok: true; done: 'saved' | 'cancelled' } | { ok: false; reason: 'too_large' | 'not_image' };

/** The settings the screen reads and changes. Validated on every write. */
export const settingsSchema = z.object({
  language: z.enum(LANGUAGES),
  digitStyle: z.enum(DIGIT_STYLES),
  themeMode: z.enum(THEME_MODES),
  fontSize: z.enum(FONT_SIZES),
  themeColor: z.enum(THEME_COLORS),
  fontFamily: z.enum(FONT_FAMILIES),
  remindDays: z.number().int().min(1).max(REMIND_DAYS_MAX),
  /** Printed above every receipt and report; empty for none. */
  printTitle: z.string().trim().max(PRINT_TITLE_MAX),
});
export type Settings = z.infer<typeof settingsSchema>;

/** A change to one or more settings; unknown keys are rejected. */
export const settingsUpdateSchema = settingsSchema.partial().strict();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const DEFAULT_SETTINGS: Settings = {
  language: 'ckb',
  digitStyle: 'western',
  themeMode: 'light',
  fontSize: 'normal',
  themeColor: 'blue',
  fontFamily: 'noto-sans-arabic',
  remindDays: DEFAULT_REMIND_DAYS,
  printTitle: '',
};

/** The settings after a change, validated; an invalid change leaves them as they were. */
export function applySettingsUpdate(current: Settings, changes: SettingsUpdate): Settings {
  const merged = settingsSchema.safeParse({ ...current, ...changes });
  return merged.success ? merged.data : current;
}
