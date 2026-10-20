import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
  type SettingsUpdate,
} from '@shared/settings';
import type { Db } from '../connection';

/** Column `key` values in the settings table, as named in ARCHITECTURE.md. */
const STORAGE_KEYS: Record<keyof Settings, string> = {
  language: 'language',
  digitStyle: 'digit_style',
  themeMode: 'theme_mode',
  fontSize: 'font_size',
};
const SETTING_NAMES = Object.keys(STORAGE_KEYS) as (keyof Settings)[];

export interface SettingsRepository {
  getAll(): Settings;
  update(changes: SettingsUpdate): Settings;
}

export function createSettingsRepository(db: Db): SettingsRepository {
  const selectAll = db.prepare<[], { key: string; value: string }>(
    'SELECT key, value FROM settings',
  );
  const upsert = db.prepare<[string, string]>(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET
       value = excluded.value,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  );

  function getAll(): Settings {
    const stored = new Map(selectAll.all().map((row) => [row.key, row.value]));
    const read = <K extends keyof Settings>(name: K): Settings[K] => {
      // A missing or unreadable value falls back to the default instead of breaking the app.
      const parsed = settingsSchema.shape[name].safeParse(stored.get(STORAGE_KEYS[name]));
      return parsed.success ? (parsed.data as Settings[K]) : DEFAULT_SETTINGS[name];
    };
    return Object.fromEntries(SETTING_NAMES.map((name) => [name, read(name)])) as Settings;
  }

  const writeAll = db.transaction((changes: SettingsUpdate) => {
    for (const name of SETTING_NAMES) {
      const value = changes[name];
      if (value !== undefined) upsert.run(STORAGE_KEYS[name], value);
    }
  });

  return {
    getAll,
    update(changes) {
      writeAll(changes);
      return getAll();
    },
  };
}
