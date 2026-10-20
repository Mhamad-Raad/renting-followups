import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, settingsUpdateSchema } from '@shared/settings';
import { createConnection, type Db } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { createSettingsRepository } from '../../src/main/db/repositories/settings';

let db: Db;

beforeEach(() => {
  db = createConnection(':memory:');
  migrate(db, MIGRATIONS);
});

afterEach(() => {
  db.close();
});

describe('settings repository', () => {
  it('returns the defaults on a new database', () => {
    expect(createSettingsRepository(db).getAll()).toEqual(DEFAULT_SETTINGS);
  });

  it('saves changes and keeps the other settings', () => {
    const settings = createSettingsRepository(db);
    expect(settings.update({ language: 'en', themeMode: 'dark' })).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'en',
      themeMode: 'dark',
    });
    expect(settings.update({ fontSize: 'large' }).language).toBe('en');
  });

  it('stores values under the documented key names', () => {
    createSettingsRepository(db).update({ digitStyle: 'arabic' });
    expect(db.prepare('SELECT key, value FROM settings').all()).toEqual([
      { key: 'digit_style', value: 'arabic' },
    ]);
  });

  it('falls back to the default when a stored value is unreadable', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('theme_mode', 'purple')").run();
    expect(createSettingsRepository(db).getAll().themeMode).toBe('light');
  });
});

describe('settings update validation', () => {
  it('accepts known settings with allowed values', () => {
    expect(settingsUpdateSchema.safeParse({ language: 'ar' }).success).toBe(true);
  });

  it.each([[{ language: 'fr' }], [{ fontSize: 99 }], [{ passwordHash: 'x' }], [null], ['ckb']])(
    'rejects %j',
    (input) => {
      expect(settingsUpdateSchema.safeParse(input).success).toBe(false);
    },
  );
});
