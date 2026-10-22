import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import type { BackupInfo, RestoreCheck, RestoreRefusal } from '@shared/backup';
import { dateStringFromLocal } from '@shared/dates';
import { createConnection } from '../db/connection';
import { migrate, type Migration } from '../db/migrate';
import { checkCopy, dateInBackupName, logoCopyName } from './backup';
import { LOGO_KINDS } from './logo';
import { clearStep, pending, stagedLogo, type RestorePaths } from './restore';

/**
 * Checking a chosen backup before the owner is asked to confirm a restore
 * (ARCHITECTURE.md section 13): it must be a whole, undamaged backup of this
 * app, not from a newer version, and an older one must upgrade cleanly.
 */

/** Reads what the owner needs to recognise a backup; null when it is not an app backup. */
function readBackup(
  file: string,
  latestVersion: number,
): { ok: false; reason: 'not_backup' | 'too_new' } | { ok: true; areas: number; receipts: number } {
  let copy: Database.Database;
  try {
    copy = new Database(file, { fileMustExist: true });
  } catch {
    return { ok: false, reason: 'not_backup' };
  }
  try {
    const has = (table: string) =>
      copy.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
      undefined;
    if (!has('schema_version') || !has('settings')) return { ok: false, reason: 'not_backup' };
    const version =
      (
        copy.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
          version: number | null;
        }
      ).version ?? 0;
    if (version > latestVersion) return { ok: false, reason: 'too_new' };
    // A backup always has a password: the app cannot be used before one is made.
    if (!copy.prepare("SELECT 1 FROM settings WHERE key = 'password_hash'").get()) {
      return { ok: false, reason: 'not_backup' };
    }
    const count = (sql: string) => (copy.prepare(sql).get() as { count: number }).count;
    return {
      ok: true,
      areas: has('areas')
        ? count('SELECT COUNT(*) AS count FROM areas WHERE deleted_at IS NULL')
        : 0,
      receipts: has('receipts')
        ? count('SELECT COUNT(*) AS count FROM receipts WHERE voided_at IS NULL')
        : 0,
    };
  } catch {
    // Not a SQLite file, or one too damaged to read.
    return { ok: false, reason: 'not_backup' };
  } finally {
    copy.close();
  }
}

/**
 * Copies the chosen backup into the staging folder and checks it. Nothing
 * of the current data is touched. On success the copy waits for the owner's
 * confirmation; otherwise it is removed.
 */
export function checkBackup(
  source: string,
  paths: RestorePaths,
  migrations: readonly Migration[],
): { check: RestoreCheck; info: BackupInfo | null } {
  const latestVersion = migrations.at(-1)?.version ?? 0;
  mkdirSync(paths.staging, { recursive: true });
  clearStep(paths, 'pending');
  const file = pending(paths);
  const refuse = (reason: RestoreRefusal) => {
    clearStep(paths, 'pending');
    return { check: { ok: false as const, reason }, info: null };
  };
  copyFileSync(source, file);

  let whole: boolean;
  try {
    whole = checkCopy(file);
  } catch {
    return refuse('not_backup');
  }
  const read = readBackup(file, latestVersion);
  if (!read.ok) return refuse(read.reason);
  if (!whole) return refuse('damaged');
  if (!upgradesCleanly(file, migrations)) return refuse('cannot_upgrade');

  const logo = LOGO_KINDS.find((kind) =>
    existsSync(join(dirname(source), logoCopyName(basename(source), kind))),
  );
  if (logo) {
    copyFileSync(
      join(dirname(source), logoCopyName(basename(source), logo)),
      stagedLogo(paths, 'pending', logo),
    );
  }
  const info: BackupInfo = {
    fileName: basename(source),
    madeOn: dateInBackupName(basename(source)) ?? dateStringFromLocal(statSync(source).mtime),
    areas: read.areas,
    receipts: read.receipts,
    hasLogo: logo !== undefined,
  };
  return { check: { ok: true }, info };
}

/**
 * Upgrades a scratch copy of an older backup with the app's migrations, so a
 * backup that could not be upgraded is refused now, and never stops the app
 * from starting after the restore.
 */
function upgradesCleanly(file: string, migrations: readonly Migration[]): boolean {
  const trial = `${file}.trial`;
  try {
    copyFileSync(file, trial);
    const db = createConnection(trial);
    try {
      migrate(db, [...migrations]);
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  } finally {
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${trial}${suffix}`, { force: true });
  }
}
