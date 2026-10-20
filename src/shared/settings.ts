import { z } from 'zod';
import { DIGIT_STYLES } from './digits';

export const LANGUAGES = ['ckb', 'en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEME_MODES = ['light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const FONT_SIZES = ['small', 'normal', 'large', 'extraLarge'] as const;
export type FontSize = (typeof FONT_SIZES)[number];

/** The settings the screen reads and changes. Validated on every write. */
export const settingsSchema = z.object({
  language: z.enum(LANGUAGES),
  digitStyle: z.enum(DIGIT_STYLES),
  themeMode: z.enum(THEME_MODES),
  fontSize: z.enum(FONT_SIZES),
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
};

/** The settings after a change, validated; an invalid change leaves them as they were. */
export function applySettingsUpdate(current: Settings, changes: SettingsUpdate): Settings {
  const merged = settingsSchema.safeParse({ ...current, ...changes });
  return merged.success ? merged.data : current;
}
