import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { DateString } from '@shared/dates';
import type { Db } from '../db/connection';

/**
 * Backups (ARCHITECTURE.md section 13): a full copy of the database made with
 * SQLite's online backup API, named `rent-backup-YYYY-MM-DD.db`, with the logo
 * copied beside it. A backup only gets its final name once it has been
 * checked, so a half-written file never looks like a good backup.
 */

/** How many backups are kept in the folder; older ones made by the app are removed. */
export const BACKUPS_KEPT = 12;

const BACKUP_NAME = /^rent-backup-(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.db$/;
const LOGO_COPY_NAME = /^(rent-backup-\d{4}-\d{2}-\d{2}(?:-\d+)?)\.logo\.(png|jpg)$/;

/** The backup's file name; a second backup on the same day gets "-2", and so on. */
export function backupFileName(date: DateString, number: number): string {
  return number === 1 ? `rent-backup-${date}.db` : `rent-backup-${date}-${number}.db`;
}

/** The logo copied beside a backup, for example `rent-backup-2026-10-22.logo.png`. */
export function logoCopyName(backupName: string, extension: 'png' | 'jpg'): string {
  return backupName.replace(/\.db$/i, `.logo.${extension}`);
}

/** The date in a backup's file name, if it has the app's naming. */
export function dateInBackupName(fileName: string): DateString | null {
  return BACKUP_NAME.exec(fileName)?.[1] ?? null;
}

/** The logo to copy with a backup: its path and file type. */
export interface LogoFile {
  path: string;
  extension: 'png' | 'jpg';
}

export class BackupFolderMissingError extends Error {
  constructor() {
    super('The backup folder does not exist');
    this.name = 'BackupFolderMissingError';
  }
}

/** Opens a copy, checks it is whole, and makes it a single self-contained file (no WAL). */
export function checkCopy(file: string): boolean {
  const copy = new Database(file, { fileMustExist: true });
  try {
    copy.pragma('journal_mode = DELETE');
    return copy.pragma('integrity_check', { simple: true }) === 'ok';
  } finally {
    copy.close();
  }
}

/**
 * Backs up the open database into `folder` and returns the new file's name.
 * Throws BackupFolderMissingError when the folder is gone (a USB drive taken out).
 */
export async function createBackup(
  db: Db,
  folder: string,
  today: DateString,
  logo: LogoFile | null,
): Promise<string> {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new BackupFolderMissingError();
  let number = 1;
  while (existsSync(join(folder, backupFileName(today, number)))) number += 1;
  const name = backupFileName(today, number);
  const partial = join(folder, `${name}.partial`);
  const logoCopy = logo ? join(folder, logoCopyName(name, logo.extension)) : null;
  try {
    await db.backup(partial);
    if (!checkCopy(partial)) throw new Error('The new backup failed its check');
    if (logo && logoCopy) copyFileSync(logo.path, logoCopy);
    renameSync(partial, join(folder, name));
  } catch (error) {
    if (logoCopy) rmSync(logoCopy, { force: true });
    throw error;
  } finally {
    rmSync(partial, { force: true });
  }
  pruneBackups(folder, BACKUPS_KEPT);
  return name;
}

/**
 * Removes all but the newest `keep` backups, with their logo copies. Only
 * files named exactly as the app names its backups are ever touched.
 */
export function pruneBackups(folder: string, keep: number): void {
  const backups = readdirSync(folder)
    .map((name) => ({ name, match: BACKUP_NAME.exec(name) }))
    .filter((entry) => entry.match !== null)
    .map(({ name, match }) => ({
      stem: name.replace(/\.db$/, ''),
      date: match?.[1] ?? '',
      number: Number(match?.[2] ?? 1),
    }))
    .sort((a, b) => (a.date === b.date ? b.number - a.number : a.date < b.date ? 1 : -1));
  const removed = new Set(backups.slice(keep).map((backup) => backup.stem));
  for (const name of readdirSync(folder)) {
    const stem = BACKUP_NAME.test(name)
      ? name.replace(/\.db$/, '')
      : LOGO_COPY_NAME.exec(name)?.[1];
    if (stem && removed.has(stem)) rmSync(join(folder, name), { force: true });
  }
}

/** True when the folder is on the same drive as the app's data, so one drive failure would lose both. */
export function isSameDrive(folder: string, dataDirectory: string): boolean {
  try {
    return statSync(folder).dev === statSync(dataDirectory).dev;
  } catch {
    return false;
  }
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

/** A name for a safety copy, such as `before-restore_2026-10-22_08-15-00`. */
export function safetyCopyName(reason: string, now: Date): string {
  return `${reason}_${fileTimestamp(now)}`;
}

/**
 * Writes a complete, consistent copy of the open database (SQLite's
 * `VACUUM INTO`, safe while the app is running) before risky operations such
 * as schema upgrades. Returns the path of the copy.
 */
export function writeSafetySnapshot(
  db: Db,
  directory: string,
  reason: string,
  now = new Date(),
): string {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${safetyCopyName(reason, now)}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}
