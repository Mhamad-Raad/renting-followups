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
import { BACKUPS_KEPT } from '@shared/backup';
import type { DateString } from '@shared/dates';
import type { Db } from '../db/connection';
import { LOGO_KINDS, type LogoKind } from './logo';

/**
 * Backups (ARCHITECTURE.md section 13): a full copy of the database made with
 * SQLite's online backup API, named `rent-backup-YYYY-MM-DD.db`, with the logo
 * copied beside it. A backup only gets its final name once it has been
 * checked, so a half-written file never looks like a good backup.
 */

const BACKUP_NAME = /^rent-backup-(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.db$/;
const LOGO_COPY_NAME = /^(rent-backup-\d{4}-\d{2}-\d{2}(?:-\d+)?)\.logo\.(png|jpg)$/;
/** What an unfinished backup leaves behind after a crash or power cut. */
const LEFTOVER_NAME =
  /^rent-backup-\d{4}-\d{2}-\d{2}(?:-\d+)?\.db\.partial(?:-wal|-shm|-journal)?$/;

/** The backup's file name; a second backup on the same day gets "-2", and so on. */
export function backupFileName(date: DateString, number: number): string {
  return number === 1 ? `rent-backup-${date}.db` : `rent-backup-${date}-${number}.db`;
}

/** The logo copied beside a backup, for example `rent-backup-2026-10-22.logo.png`. */
export function logoCopyName(backupName: string, extension: LogoKind): string {
  return backupName.replace(/\.db$/i, `.logo.${extension}`);
}

/** The date in a backup's file name, if it has the app's naming. */
export function dateInBackupName(fileName: string): DateString | null {
  return BACKUP_NAME.exec(fileName)?.[1] ?? null;
}

/** The logo to copy with a backup: its path and file type. */
export interface LogoFile {
  path: string;
  extension: LogoKind;
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
  for (const leftover of readdirSync(folder).filter((file) => LEFTOVER_NAME.test(file))) {
    rmSync(join(folder, leftover), { force: true });
  }
  let number = 1;
  while (existsSync(join(folder, backupFileName(today, number)))) number += 1;
  const name = backupFileName(today, number);
  // A logo copy left from a backup of this name deleted by hand must not be taken for this one's.
  for (const kind of LOGO_KINDS) rmSync(join(folder, logoCopyName(name, kind)), { force: true });
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
  pruneBackups(folder, BACKUPS_KEPT, name);
  return name;
}

/**
 * Removes all but the newest `keep` backups, with their logo copies. Only
 * files named exactly as the app names its backups are ever touched, and
 * `justMade` never is. Newest means last written, not the date in the name,
 * so backups named with a clock that was ahead do not crowd out later ones.
 * A clock set back makes new backups look oldest; the newest is still always
 * kept, and the app warns when the computer date looks wrong.
 */
export function pruneBackups(folder: string, keep: number, justMade: string | null = null): void {
  const backups = readdirSync(folder)
    .filter((name) => BACKUP_NAME.test(name) && name !== justMade)
    .map((name) => ({ name, written: statSync(join(folder, name)).mtimeMs }))
    .sort((a, b) => b.written - a.written || (a.name < b.name ? 1 : -1));
  const kept = justMade === null ? keep : keep - 1;
  const removed = new Set(
    backups.slice(Math.max(kept, 0)).map((backup) => backup.name.replace(/\.db$/, '')),
  );
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
