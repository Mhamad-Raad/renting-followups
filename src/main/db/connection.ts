import Database from 'better-sqlite3';

export type Db = Database.Database;

let connection: Db | null = null;

/**
 * Opens a SQLite file with the app's settings: WAL journal and enforced foreign
 * keys. This is the only module that knows how the file is opened, so adding
 * encryption later (SQLCipher) touches only this file.
 */
export function createConnection(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/** Opens the app's one shared connection. Called once at startup. */
export function openDatabase(file: string): Db {
  if (connection) throw new Error('Database is already open');
  connection = createConnection(file);
  return connection;
}

export function closeDatabase(): void {
  connection?.close();
  connection = null;
}

/** SQLite's own full check of the file (ARCHITECTURE.md section 15); true when it is sound. */
export function isIntact(db: Db): boolean {
  return db.pragma('integrity_check', { simple: true }) === 'ok';
}

/** True for the errors SQLite gives when a file is damaged or is not a database at all. */
export function isDamageError(error: unknown): boolean {
  const code = error instanceof Database.SqliteError ? error.code : '';
  return code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB';
}

/** Reads the saved language from a file that may be damaged; null when it cannot be read. */
export function readLanguageQuietly(file: string): string | null {
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'language'").get() as
        { value: string } | undefined;
      return row?.value ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
