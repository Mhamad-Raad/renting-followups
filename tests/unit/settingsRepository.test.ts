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
import {
  createBackupSettingsRepository,
  createSettingsRepository,
} from '../../src/main/db/repositories/settings';

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

  it('remembers the sidebar style, light by default', () => {
    const settings = createSettingsRepository(db);
    expect(settings.getAll().sidebarStyle).toBe('light');
    settings.update({ sidebarStyle: 'dark' });
    expect(createSettingsRepository(db).getAll().sidebarStyle).toBe('dark');
    expect(db.prepare("SELECT value FROM settings WHERE key = 'sidebar_style'").get()).toEqual({
      value: 'dark',
    });
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
    ['theme_color', 'orange', 'themeColor'],
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

describe('backup settings', () => {
  it('keeps the folder and the last backup date, and ignores an unreadable date', () => {
    const backup = createBackupSettingsRepository(db);
    expect(backup.folder()).toBeNull();
    expect(backup.lastBackupOn()).toBeNull();
    backup.setFolder('E:\\Backups');
    backup.setLastBackupOn('2026-10-22');
    expect(backup.folder()).toBe('E:\\Backups');
    expect(backup.lastBackupOn()).toBe('2026-10-22');
    db.prepare("UPDATE settings SET value = 'yesterday' WHERE key = 'last_backup_at'").run();
    expect(backup.lastBackupOn()).toBeNull();
  });
});
