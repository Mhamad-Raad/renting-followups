import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConnection, type Db } from '../../src/main/db/connection';
import {
  DatabaseTooNewError,
  getSchemaVersion,
  loadMigrations,
  migrate,
  type Migration,
} from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { writeSafetySnapshot } from '../../src/main/services/backup';

const openDbs: Db[] = [];
const tempDirs: string[] = [];

function memoryDb(): Db {
  const db = createConnection(':memory:');
  openDbs.push(db);
  return db;
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rent-tracker-migrate-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  openDbs.splice(0).forEach((db) => db.close());
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const testMigrations: Migration[] = [
  { version: 1, name: 'notes', sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT);' },
  { version: 2, name: 'note_pin', sql: 'ALTER TABLE notes ADD COLUMN pinned INTEGER DEFAULT 0;' },
];

describe('loadMigrations', () => {
  it('orders migration files by number', () => {
    const loaded = loadMigrations({ './002_b.sql': 'B', './001_a.sql': 'A' });
    expect(loaded.map((m) => [m.version, m.name, m.sql])).toEqual([
      [1, 'a', 'A'],
      [2, 'b', 'B'],
    ]);
  });

  it('rejects gaps, duplicates and bad names', () => {
    expect(() => loadMigrations({ './001_a.sql': '', './003_c.sql': '' })).toThrow();
    expect(() => loadMigrations({ './001_a.sql': '', './001_b.sql': '' })).toThrow();
    expect(() => loadMigrations({ './1_a.sql': '' })).toThrow();
  });

  it('loads the real migration files', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(MIGRATIONS[0]?.version).toBe(1);
  });
});

describe('migrate', () => {
  it('builds a new database from scratch without a safety copy', () => {
    const db = memoryDb();
    const beforeMigrate = vi.fn();
    expect(migrate(db, testMigrations, { beforeMigrate })).toEqual({ from: 0, to: 2 });
    expect(getSchemaVersion(db)).toBe(2);
    expect(beforeMigrate).not.toHaveBeenCalled();
  });

  it('does nothing when already up to date', () => {
    const db = memoryDb();
    migrate(db, testMigrations);
    const beforeMigrate = vi.fn();
    expect(migrate(db, testMigrations, { beforeMigrate })).toEqual({ from: 2, to: 2 });
    expect(beforeMigrate).not.toHaveBeenCalled();
  });

  it('upgrades an older database, keeps its data and saves a safety copy first', () => {
    const db = memoryDb();
    migrate(db, testMigrations.slice(0, 1));
    db.prepare("INSERT INTO notes (text) VALUES ('kept')").run();

    const beforeMigrate = vi.fn();
    expect(migrate(db, testMigrations, { beforeMigrate })).toEqual({ from: 1, to: 2 });
    expect(beforeMigrate).toHaveBeenCalledWith(1);
    expect(db.prepare('SELECT text, pinned FROM notes').all()).toEqual([
      { text: 'kept', pinned: 0 },
    ]);
  });

  it('leaves the database untouched when a migration fails', () => {
    const db = memoryDb();
    migrate(db, testMigrations.slice(0, 1));
    const broken: Migration[] = [
      ...testMigrations,
      {
        version: 3,
        name: 'broken',
        sql: 'CREATE TABLE extra (id INTEGER); SELECT * FROM missing;',
      },
    ];
    expect(() => migrate(db, broken)).toThrow();
    expect(getSchemaVersion(db)).toBe(1);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name = 'extra'").all();
    expect(tables).toEqual([]);
  });

  it('refuses a database from a newer app version', () => {
    const db = memoryDb();
    migrate(db, testMigrations);
    expect(() => migrate(db, testMigrations.slice(0, 1))).toThrow(DatabaseTooNewError);
  });

  it('upgrades a database from every earlier version of the real schema', () => {
    for (let version = 0; version < MIGRATIONS.length; version += 1) {
      const db = memoryDb();
      migrate(db, MIGRATIONS.slice(0, version));
      expect(migrate(db, MIGRATIONS).to).toBe(MIGRATIONS.length);
    }
  });
});

describe('real schema upgrades keep existing data', () => {
  it('2: categories and areas are added without touching saved settings', () => {
    const db = memoryDb();
    migrate(db, MIGRATIONS.slice(0, 1));
    db.prepare("INSERT INTO settings (key, value) VALUES ('language', 'en')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('password_hash', 'scrypt1:abc')").run();

    migrate(db, MIGRATIONS.slice(0, 2));
    expect(db.prepare('SELECT key, value FROM settings ORDER BY key').all()).toEqual([
      { key: 'language', value: 'en' },
      { key: 'password_hash', value: 'scrypt1:abc' },
    ]);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining(['areas', 'area_prices', 'audit_log', 'categories', 'renters']),
    );
  });

  it('3: receipts and allocations are added without touching areas or their history', () => {
    const db = memoryDb();
    migrate(db, MIGRATIONS.slice(0, 2));
    db.prepare(
      "INSERT INTO categories (id, name, name_normalized) VALUES (1, 'Shops', 'shops')",
    ).run();
    db.prepare(
      `INSERT INTO areas (id, category_id, name, name_normalized, currency)
       VALUES (1, 1, 'Shop 1', 'shop 1', 'USD')`,
    ).run();
    db.prepare(
      `INSERT INTO area_prices (area_id, monthly_price, effective_from_year, effective_from_month)
       VALUES (1, 50000, 2026, 1)`,
    ).run();
    const before = ['areas', 'area_prices', 'categories'].map((table) =>
      db.prepare(`SELECT * FROM ${table}`).all(),
    );

    migrate(db, MIGRATIONS.slice(0, 3));
    expect(
      ['areas', 'area_prices', 'categories'].map((table) =>
        db.prepare(`SELECT * FROM ${table}`).all(),
      ),
    ).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) AS n FROM receipts').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM payment_allocations').get()).toEqual({ n: 0 });
  });
});

describe('writeSafetySnapshot', () => {
  it('writes a complete copy that opens on its own', () => {
    const dir = tempDir();
    const db = createConnection(join(dir, 'live.db'));
    openDbs.push(db);
    migrate(db, testMigrations);
    db.prepare("INSERT INTO notes (text) VALUES ('saved')").run();

    const file = writeSafetySnapshot(
      db,
      join(dir, 'safety'),
      'before-migration-v2',
      new Date('2026-10-20T08:30:00Z'),
    );
    expect(file).toMatch(/before-migration-v2_2026-10-20_08-30-00\.db$/);
    const copy = createConnection(file);
    openDbs.push(copy);
    expect(copy.prepare('SELECT text FROM notes').all()).toEqual([{ text: 'saved' }]);
  });
});
