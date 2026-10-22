import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applySettingsUpdate,
  DEFAULT_SETTINGS,
  settingsUpdateSchema,
  type SettingsUpdate,
} from '@shared/settings';
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

  it('keeps numbers and text as they were saved', () => {
    const settings = createSettingsRepository(db);
    settings.update({ remindDays: 10, printTitle: '  Kawa Rentals  ', themeColor: 'teal' });
    expect(settings.getAll()).toMatchObject({
      remindDays: 10,
      printTitle: 'Kawa Rentals',
      themeColor: 'teal',
    });
    expect(
      db.prepare("SELECT value FROM settings WHERE key = 'remind_days_before_month_end'").get(),
    ).toEqual({ value: '10' });
  });

  it.each([
    ['remind_days_before_month_end', 'soon', 'remindDays'],
    ['remind_days_before_month_end', '0', 'remindDays'],
    ['font_family', 'Comic Sans', 'fontFamily'],
    ['theme_color', 'green', 'themeColor'],
  ] as const)('falls back to the default when %s is %j', (key, value, name) => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
    expect(createSettingsRepository(db).getAll()[name]).toBe(DEFAULT_SETTINGS[name]);
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

  it.each([
    [{ language: 'fr' }],
    [{ fontSize: 99 }],
    [{ themeColor: 'red' }],
    [{ remindDays: 0 }],
    [{ remindDays: 2.5 }],
    [{ remindDays: '7' }],
    [{ printTitle: 'x'.repeat(81) }],
    [{ passwordHash: 'x' }],
    [null],
    ['ckb'],
  ])('rejects %j', (input) => {
    expect(settingsUpdateSchema.safeParse(input).success).toBe(false);
  });
});

describe('applySettingsUpdate', () => {
  it('merges a change into the current settings', () => {
    expect(applySettingsUpdate(DEFAULT_SETTINGS, { fontSize: 'large' })).toEqual({
      ...DEFAULT_SETTINGS,
      fontSize: 'large',
    });
  });

  it('ignores an invalid change', () => {
    const invalid = { language: 'fr' } as unknown as SettingsUpdate;
    expect(applySettingsUpdate(DEFAULT_SETTINGS, invalid)).toEqual(DEFAULT_SETTINGS);
  });
});
