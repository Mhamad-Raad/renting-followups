import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BACKUPS_KEPT } from '@shared/backup';
import {
  BackupFolderMissingError,
  createBackup,
  dateInBackupName,
  isSameDrive,
  pruneBackups,
} from '../../src/main/services/backup';
import { areaInput, createTestDatabase } from './helpers';

let folder: string;
let db: ReturnType<typeof createTestDatabase>['db'];
let repos: ReturnType<typeof createTestDatabase>['repos'];

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'rent-tracker-backup-'));
  ({ db, repos } = createTestDatabase());
  const category = repos.categories.create({ name: 'Shops', color: null });
  if (!category.ok) throw new Error('category not created');
  repos.areas.create(areaInput(category.id));
});

afterEach(() => {
  db.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('createBackup', () => {
  it('writes a complete, self-contained copy named after the day', async () => {
    expect(await createBackup(db, folder, '2026-10-22', null)).toBe('rent-backup-2026-10-22.db');
    expect(readdirSync(folder)).toEqual(['rent-backup-2026-10-22.db']);
    const copy = new Database(join(folder, 'rent-backup-2026-10-22.db'), { readonly: true });
    try {
      expect(copy.pragma('journal_mode', { simple: true })).toBe('delete');
      expect(copy.prepare('SELECT name FROM areas').all()).toEqual([{ name: 'Shop 1' }]);
    } finally {
      copy.close();
    }
  });

  it('never overwrites an earlier backup of the same day', async () => {
    await createBackup(db, folder, '2026-10-22', null);
    expect(await createBackup(db, folder, '2026-10-22', null)).toBe('rent-backup-2026-10-22-2.db');
    expect(await createBackup(db, folder, '2026-10-22', null)).toBe('rent-backup-2026-10-22-3.db');
  });

  it('copies the logo beside the backup', async () => {
    const logo = join(folder, 'source.png');
    writeFileSync(logo, 'picture');
    await createBackup(db, folder, '2026-10-22', { path: logo, extension: 'png' });
    expect(readFileSync(join(folder, 'rent-backup-2026-10-22.logo.png'), 'utf8')).toBe('picture');
  });

  it('never pairs a new backup with a logo left from one deleted by hand', async () => {
    writeFileSync(join(folder, 'rent-backup-2026-10-22.logo.png'), 'old picture');
    const logo = join(folder, 'source.jpg');
    writeFileSync(logo, 'new picture');
    await createBackup(db, folder, '2026-10-22', { path: logo, extension: 'jpg' });
    expect(existsSync(join(folder, 'rent-backup-2026-10-22.logo.png'))).toBe(false);
    expect(readFileSync(join(folder, 'rent-backup-2026-10-22.logo.jpg'), 'utf8')).toBe(
      'new picture',
    );
  });

  it('says plainly when the folder is gone, and writes nothing', async () => {
    await expect(createBackup(db, join(folder, 'usb'), '2026-10-22', null)).rejects.toBeInstanceOf(
      BackupFolderMissingError,
    );
    expect(existsSync(join(folder, 'usb'))).toBe(false);
  });

  it('leaves no half-written file when the backup fails part way', async () => {
    // The copy is written and checked, then copying the logo fails.
    const missingLogo = { path: join(folder, 'gone.png'), extension: 'png' as const };
    await expect(createBackup(db, folder, '2026-10-22', missingLogo)).rejects.toThrow();
    expect(readdirSync(folder)).toEqual([]);
  });

  it('clears what an interrupted backup left behind, and nothing else', async () => {
    for (const name of [
      'rent-backup-2026-10-01.db.partial',
      'rent-backup-2026-10-01.db.partial-wal',
      'notes.partial',
    ]) {
      writeFileSync(join(folder, name), '');
    }
    await createBackup(db, folder, '2026-10-22', null);
    expect(readdirSync(folder).sort()).toEqual(['notes.partial', 'rent-backup-2026-10-22.db']);
  });

  it('keeps a new backup even when older ones carry later dates (a clock that was ahead)', async () => {
    for (let month = 1; month <= BACKUPS_KEPT; month += 1) {
      const name = join(folder, `rent-backup-2027-${String(month).padStart(2, '0')}-01.db`);
      writeFileSync(name, '');
      // Written long ago, in order: 2027-01 is the oldest file.
      utimesSync(name, month * 1000, month * 1000);
    }
    const made = await createBackup(db, folder, '2026-10-22', null);
    const left = readdirSync(folder);
    expect(left).toContain(made);
    expect(left).toHaveLength(BACKUPS_KEPT);
    expect(left).not.toContain('rent-backup-2027-01-01.db');
  });
});

describe('pruneBackups', () => {
  it('keeps the newest backups and their logos, and never touches other files', () => {
    const days = Array.from(
      { length: 14 },
      (_, index) => `2026-01-${String(index + 1).padStart(2, '0')}`,
    );
    days.forEach((day, index) => {
      const file = join(folder, `rent-backup-${day}.db`);
      writeFileSync(file, '');
      // Written in date order, a second apart.
      utimesSync(file, (index + 1) * 1000, (index + 1) * 1000);
    });
    writeFileSync(join(folder, 'rent-backup-2026-01-01.logo.png'), '');
    writeFileSync(join(folder, 'rent-backup-2026-01-14-2.db'), '');
    utimesSync(join(folder, 'rent-backup-2026-01-14-2.db'), 20_000, 20_000);
    writeFileSync(join(folder, 'my-own-copy.db'), '');
    writeFileSync(join(folder, 'rent-backup-old.db'), '');
    pruneBackups(folder, BACKUPS_KEPT);
    const left = readdirSync(folder).sort();
    expect(left).toContain('rent-backup-2026-01-14-2.db');
    expect(left).toContain('my-own-copy.db');
    expect(left).toContain('rent-backup-old.db');
    expect(left.filter((name) => dateInBackupName(name) !== null)).toHaveLength(BACKUPS_KEPT);
    // The 13th newest and older are gone, with their logo copies.
    for (const gone of ['2026-01-01', '2026-01-02', '2026-01-03']) {
      expect(left).not.toContain(`rent-backup-${gone}.db`);
    }
    expect(left).not.toContain('rent-backup-2026-01-01.logo.png');
  });
});

describe('isSameDrive', () => {
  it('is true for two folders on one drive and false for a missing folder', () => {
    expect(isSameDrive(folder, tmpdir())).toBe(true);
    expect(isSameDrive(join(folder, 'missing'), tmpdir())).toBe(false);
  });
});
