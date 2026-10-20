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
