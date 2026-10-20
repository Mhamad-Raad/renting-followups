import type { Db } from './connection';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** Thrown when the database was written by a newer version of the app. */
export class DatabaseTooNewError extends Error {
  constructor(
    readonly databaseVersion: number,
    readonly appVersion: number,
  ) {
    super(`Database schema ${databaseVersion} is newer than this app (${appVersion})`);
    this.name = 'DatabaseTooNewError';
  }
}

const FILE_NAME = /(?:^|\/)(\d{3})_([a-z0-9_]+)\.sql$/;

/**
 * Turns `{ './migrations/001_settings.sql': '...' }` into an ordered list and
 * checks the numbering is 1, 2, 3... with no gaps or duplicates.
 */
export function loadMigrations(files: Record<string, string>): Migration[] {
  const migrations = Object.entries(files)
    .map(([path, sql]) => {
      const match = FILE_NAME.exec(path);
      if (!match?.[1] || !match[2]) throw new Error(`Badly named migration file: ${path}`);
      return { version: Number(match[1]), name: match[2], sql };
    })
    .sort((a, b) => a.version - b.version);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migration ${index + 1} is missing or duplicated`);
    }
  });
  return migrations;
}

export function getSchemaVersion(db: Db): number {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (
       version INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     )`,
  );
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
    version: number | null;
  };
  return row.version ?? 0;
}

export interface MigrateOptions {
  /** Runs before an existing database is changed, to save a safety copy. */
  beforeMigrate?: (fromVersion: number) => void;
}

/**
 * Brings the database up to the newest schema. All pending migrations run in
 * one transaction: the file is either fully upgraded or left untouched.
 */
export function migrate(
  db: Db,
  migrations: Migration[],
  options: MigrateOptions = {},
): { from: number; to: number } {
  const from = getSchemaVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;
  if (from > latest) throw new DatabaseTooNewError(from, latest);

  const pending = migrations.filter((migration) => migration.version > from);
  if (pending.length === 0) return { from, to: from };

  // A brand-new database has nothing to protect yet.
  if (from > 0) options.beforeMigrate?.(from);

  const record = db.prepare('INSERT INTO schema_version (version) VALUES (?)');
  db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      record.run(migration.version);
    }
  })();
  return { from, to: latest };
}
