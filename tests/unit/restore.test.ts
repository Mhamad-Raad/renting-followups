import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConnection, type Db } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { createRepositories } from '../../src/main/db/repositories';
import { createBackup } from '../../src/main/services/backup';
import { checkBackup } from '../../src/main/services/backupCheck';
import {
  applyReadyRestore,
  confirmRestore,
  type RestorePaths,
} from '../../src/main/services/restore';
import { areaInput } from './helpers';

const LATEST = MIGRATIONS.at(-1)?.version ?? 0;
const NOW = new Date(2026, 9, 22, 9, 30);

let root: string;
let paths: RestorePaths;
let backups: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rent-tracker-restore-'));
  mkdirSync(join(root, 'data'));
  backups = join(root, 'usb');
  mkdirSync(backups);
  paths = {
    staging: join(root, 'data', 'restore'),
    database: join(root, 'data', 'rent-tracker.db'),
    logoFolder: join(root, 'data', 'logo'),
    safetyFolder: join(root, 'data', 'safety-copies'),
  };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A database file with a password and `areas` areas, like the app's own. */
function makeDatabase(file: string, areas: number, migrations = MIGRATIONS): Db {
  const db = createConnection(file);
  migrate(db, migrations);
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('password_hash', 'h'), ('password_salt', 's')",
  ).run();
  if (migrations === MIGRATIONS) {
    const repos = createRepositories(db);
    const category = repos.categories.create({ name: 'Shops', color: null });
    if (!category.ok) throw new Error('category not created');
    for (let index = 1; index <= areas; index += 1) {
      repos.areas.create(areaInput(category.id, { name: `Shop ${index}` }));
    }
  } else {
    // An older schema: rows written as that version of the app wrote them.
    db.exec("INSERT INTO categories (name, name_normalized) VALUES ('Shops', 'shops')");
    const insert = db.prepare(
      "INSERT INTO areas (category_id, name, name_normalized, currency) VALUES (1, ?, ?, 'IQD')",
    );
    for (let index = 1; index <= areas; index += 1) insert.run(`Shop ${index}`, `shop ${index}`);
  }
  return db;
}

/** Every row of every table, to compare two databases exactly. */
function dump(db: Db): Record<string, unknown[]> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]),
  );
}

const areaCount = (file: string) => {
  const db = new Database(file, { readonly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS count FROM areas').get() as { count: number }).count;
  } finally {
    db.close();
  }
};

describe('backup then restore', () => {
  it('gives back exactly the data of the backup, keeping a safety copy of what it replaced', async () => {
    const live = makeDatabase(paths.database, 2);
    const name = await createBackup(live, backups, '2026-10-01', null);
    const atBackup = dump(live);
    createRepositories(live).areas.create(areaInput(1, { name: 'Shop 3' }));

    const { check, info } = checkBackup(join(backups, name), paths, MIGRATIONS);
    expect(check).toEqual({ ok: true });
    expect(info).toEqual({
      fileName: 'rent-backup-2026-10-01.db',
      madeOn: '2026-10-01',
      areas: 2,
      receipts: 0,
      hasLogo: false,
    });
    expect(info && confirmRestore(paths, info)).toBe(true);
    live.close();

    expect(applyReadyRestore(paths, NOW)).toEqual({ ok: true, madeOn: '2026-10-01' });
    const restored = createConnection(paths.database);
    try {
      expect(dump(restored)).toEqual(atBackup);
    } finally {
      restored.close();
    }
    const [safety] = readdirSync(paths.safetyFolder);
    expect(safety).toMatch(/^before-restore_2026-10-22_\d{2}-30-00\.db$/);
    expect(areaCount(join(paths.safetyFolder, safety ?? ''))).toBe(3);
    // Nothing is left waiting: the next start opens normally.
    expect(applyReadyRestore(paths, NOW)).toBeNull();
  });

  it('brings back the logo saved with the backup, and removes a logo the backup did not have', async () => {
    const live = makeDatabase(paths.database, 1);
    mkdirSync(paths.logoFolder);
    writeFileSync(join(paths.logoFolder, 'logo.png'), 'old logo');
    const withLogo = join(root, 'logo.jpg');
    writeFileSync(withLogo, 'backup logo');
    const name = await createBackup(live, backups, '2026-10-01', {
      path: withLogo,
      extension: 'jpg',
    });
    live.close();

    const { info } = checkBackup(join(backups, name), paths, MIGRATIONS);
    expect(info?.hasLogo).toBe(true);
    if (info) confirmRestore(paths, info);
    applyReadyRestore(paths, NOW);
    expect(readdirSync(paths.logoFolder)).toEqual(['logo.jpg']);
    expect(readFileSync(join(paths.logoFolder, 'logo.jpg'), 'utf8')).toBe('backup logo');
    // The replaced logo is kept with the safety copy.
    expect(readdirSync(paths.safetyFolder).some((file) => file.endsWith('.logo.png'))).toBe(true);
  });

  it('restores an older backup, which the normal upgrade then brings up to date', async () => {
    const older = makeDatabase(join(root, 'old.db'), 1, MIGRATIONS.slice(0, 2));
    const name = await createBackup(older, backups, '2025-01-01', null);
    older.close();
    makeDatabase(paths.database, 0).close();

    const { check, info } = checkBackup(join(backups, name), paths, MIGRATIONS);
    expect(check).toEqual({ ok: true });
    if (info) confirmRestore(paths, info);
    applyReadyRestore(paths, NOW);
    const restored = createConnection(paths.database);
    try {
      expect(migrate(restored, MIGRATIONS)).toEqual({ from: 2, to: LATEST });
      expect(restored.prepare('SELECT name FROM areas').all()).toEqual([{ name: 'Shop 1' }]);
    } finally {
      restored.close();
    }
  });

  it('keeps changes a crash left in the journal, in the safety copy', async () => {
    const backupSource = makeDatabase(join(root, 'source.db'), 1);
    const name = await createBackup(backupSource, backups, '2026-10-01', null);
    backupSource.close();

    // A live database whose last change is still only in its journal, as after a crash.
    const live = makeDatabase(join(root, 'running.db'), 1);
    live.pragma('wal_autocheckpoint = 0');
    createRepositories(live).areas.create(areaInput(1, { name: 'Only in the journal' }));
    for (const suffix of ['', '-wal', '-shm']) {
      copyFileSync(join(root, `running.db${suffix}`), `${paths.database}${suffix}`);
    }
    live.close();
    expect(existsSync(`${paths.database}-wal`)).toBe(true);

    const { info } = checkBackup(join(backups, name), paths, MIGRATIONS);
    if (info) confirmRestore(paths, info);
    expect(applyReadyRestore(paths, NOW)?.ok).toBe(true);
    expect(existsSync(`${paths.database}-wal`)).toBe(false);
    const safety = readdirSync(paths.safetyFolder).find((file) => file.endsWith('.db')) ?? '';
    expect(areaCount(join(paths.safetyFolder, safety))).toBe(2);
    expect(areaCount(paths.database)).toBe(1);
  });
});

describe('checking a chosen file', () => {
  it('refuses an older backup that cannot be brought up to date', async () => {
    const older = makeDatabase(join(root, 'old.db'), 1, MIGRATIONS.slice(0, 2));
    // Something the next upgrade step cannot work with.
    older.exec('CREATE TABLE receipts (id INTEGER PRIMARY KEY, voided_at TEXT)');
    const name = await createBackup(older, backups, '2025-01-01', null);
    older.close();
    expect(checkBackup(join(backups, name), paths, MIGRATIONS).check).toEqual({
      ok: false,
      reason: 'cannot_upgrade',
    });
    expect(readdirSync(paths.staging)).toEqual([]);
  });

  const refused = (file: string) => {
    const result = checkBackup(file, paths, MIGRATIONS);
    expect(readdirSync(paths.staging)).toEqual([]);
    return result.check;
  };

  it('refuses a file that is not a database', () => {
    writeFileSync(join(backups, 'notes.db'), 'just text, not a database at all');
    expect(refused(join(backups, 'notes.db'))).toEqual({ ok: false, reason: 'not_backup' });
  });

  it('refuses a database that is not one of this app', () => {
    const other = new Database(join(backups, 'other.db'));
    other.exec('CREATE TABLE things (id INTEGER PRIMARY KEY)');
    other.close();
    expect(refused(join(backups, 'other.db'))).toEqual({ ok: false, reason: 'not_backup' });
  });

  it('refuses a backup from a newer version of the app', async () => {
    const newer = makeDatabase(join(root, 'newer.db'), 1);
    newer.prepare('INSERT INTO schema_version (version) VALUES (?)').run(LATEST + 1);
    const name = await createBackup(newer, backups, '2027-01-01', null);
    newer.close();
    expect(refused(join(backups, name))).toEqual({ ok: false, reason: 'too_new' });
  });

  it('refuses a damaged backup', async () => {
    const source = makeDatabase(join(root, 'source.db'), 40);
    const name = await createBackup(source, backups, '2026-10-01', null);
    source.close();
    const file = join(backups, name);
    const bytes = readFileSync(file);
    // Scribble over the middle of the file, as a failing disk might.
    bytes.fill(0x55, 4096 + 100, 4096 * 3);
    writeFileSync(file, bytes);
    expect(refused(file).ok).toBe(false);
  });

  it('changes nothing in the current data', async () => {
    const live = makeDatabase(paths.database, 2);
    const before = dump(live);
    writeFileSync(join(backups, 'notes.db'), 'not a database');
    checkBackup(join(backups, 'notes.db'), paths, MIGRATIONS);
    expect(dump(live)).toEqual(before);
    live.close();
  });
});

describe('when the swap cannot be done', () => {
  it('leaves the current data exactly as it was', async () => {
    const source = makeDatabase(join(root, 'source.db'), 1);
    const name = await createBackup(source, backups, '2026-10-01', null);
    source.close();
    const { info } = checkBackup(join(backups, name), paths, MIGRATIONS);
    if (info) confirmRestore(paths, info);
    // A folder where the data file should be makes every step fail.
    mkdirSync(paths.database);
    expect(applyReadyRestore(paths, NOW)).toEqual({ ok: false, madeOn: '2026-10-01' });
    expect(readdirSync(paths.database)).toEqual([]);
    expect(applyReadyRestore(paths, NOW)).toBeNull();
  });
});
