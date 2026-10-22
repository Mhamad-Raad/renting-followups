import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { dateStringFromLocal, type DateString } from '@shared/dates';
import type { BackupInfo, RestoreCheck, RestoreOutcome } from '@shared/backup';
import { checkCopy, dateInBackupName, logoCopyName, safetyCopyName } from './backup';
import { logoFileName, type LogoKind } from './logo';

/**
 * Restore (ARCHITECTURE.md section 13) in two steps, so the data file is
 * never replaced while it is open:
 *
 * 1. `checkBackup` copies the chosen file into the app's `restore` folder and
 *    checks it (a real backup, undamaged, not from a newer app). The owner
 *    then sees what it holds and confirms; `confirmRestore` marks it ready.
 * 2. The app restarts, and before it opens the database `applyReadyRestore`
 *    keeps a safety copy of the current data and puts the backup in its place.
 *    An older backup is then upgraded by the normal migrations.
 */

const LOGO_KINDS: readonly LogoKind[] = ['png', 'jpg'];

export interface RestorePaths {
  /** The app's `restore` folder, where a checked backup waits. */
  staging: string;
  /** The live database file. */
  database: string;
  /** The folder holding the logo copy. */
  logoFolder: string;
  /** Where safety copies of replaced data go. */
  safetyFolder: string;
}

const pending = (paths: RestorePaths) => join(paths.staging, 'pending.db');
const ready = (paths: RestorePaths) => join(paths.staging, 'ready.db');
const stagedLogo = (paths: RestorePaths, step: 'pending' | 'ready', kind: LogoKind) =>
  join(paths.staging, `${step}-logo.${kind}`);
const readyInfo = (paths: RestorePaths) => join(paths.staging, 'ready.json');

function clearStep(paths: RestorePaths, step: 'pending' | 'ready'): void {
  rmSync(join(paths.staging, `${step}.db`), { force: true });
  for (const kind of LOGO_KINDS) rmSync(stagedLogo(paths, step, kind), { force: true });
  if (step === 'ready') rmSync(readyInfo(paths), { force: true });
}

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
  latestVersion: number,
): { check: RestoreCheck; info: BackupInfo | null } {
  mkdirSync(paths.staging, { recursive: true });
  clearStep(paths, 'pending');
  const file = pending(paths);
  const refuse = (reason: 'not_backup' | 'damaged' | 'too_new') => {
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

/** The owner confirmed: the checked backup will replace the data at the next start. */
export function confirmRestore(paths: RestorePaths, info: BackupInfo): boolean {
  if (!existsSync(pending(paths))) return false;
  clearStep(paths, 'ready');
  for (const kind of LOGO_KINDS) {
    if (existsSync(stagedLogo(paths, 'pending', kind))) {
      renameSync(stagedLogo(paths, 'pending', kind), stagedLogo(paths, 'ready', kind));
    }
  }
  writeFileSync(readyInfo(paths), JSON.stringify({ madeOn: info.madeOn }));
  renameSync(pending(paths), ready(paths));
  return true;
}

/** Copies a file if it exists. */
function copyIfPresent(from: string, to: string): void {
  if (existsSync(from)) copyFileSync(from, to);
}

/**
 * Folds any changes still in the journal (left by a crash) into the data file,
 * so the file on its own is complete. Not possible for a damaged file; its
 * journal is then kept with the safety copy instead.
 */
function foldJournal(database: string): void {
  try {
    const old = new Database(database, { fileMustExist: true });
    try {
      old.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      old.close();
    }
  } catch {
    // Damaged or missing: handled by moving the journal aside below.
  }
}

/**
 * Runs at startup, before the database is opened. If a confirmed backup is
 * waiting, keeps a safety copy of the current data (database, journal and
 * logo) and then puts the backup and its logo in place. Returns null when
 * there was nothing to restore. If anything fails, the current data is left
 * as it was.
 */
export function applyReadyRestore(paths: RestorePaths, now: Date): RestoreOutcome | null {
  if (!existsSync(ready(paths))) return null;
  let madeOn: DateString | null = null;
  try {
    madeOn = (JSON.parse(readFileSync(readyInfo(paths), 'utf8')) as { madeOn: DateString }).madeOn;
  } catch {
    // The date is only for the message; the restore itself does not need it.
  }
  const moved: [from: string, to: string][] = [];
  try {
    mkdirSync(paths.safetyFolder, { recursive: true });
    const safety = join(paths.safetyFolder, safetyCopyName('before-restore', now));
    foldJournal(paths.database);
    copyIfPresent(paths.database, `${safety}.db`);
    for (const kind of LOGO_KINDS) {
      copyIfPresent(join(paths.logoFolder, logoFileName(kind)), `${safety}.logo.${kind}`);
    }
    // A journal left over would be applied to the backup and spoil it, so it moves
    // to the safety copy (never deleted).
    for (const suffix of ['-wal', '-shm']) {
      const journal = `${paths.database}${suffix}`;
      if (!existsSync(journal)) continue;
      renameSync(journal, `${safety}.db${suffix}`);
      moved.push([journal, `${safety}.db${suffix}`]);
    }
    renameSync(ready(paths), paths.database);
  } catch {
    // Put back whatever was moved, so the current data is exactly as before.
    for (const [from, to] of moved) {
      try {
        renameSync(to, from);
      } catch {
        // Still safe: the file is in the safety copies folder.
      }
    }
    clearStep(paths, 'ready');
    return { ok: false, madeOn };
  }

  // The data is restored; the logo follows it. A logo problem never undoes the restore.
  try {
    mkdirSync(paths.logoFolder, { recursive: true });
    for (const kind of LOGO_KINDS)
      rmSync(join(paths.logoFolder, logoFileName(kind)), { force: true });
    for (const kind of LOGO_KINDS) {
      if (existsSync(stagedLogo(paths, 'ready', kind))) {
        renameSync(stagedLogo(paths, 'ready', kind), join(paths.logoFolder, logoFileName(kind)));
      }
    }
  } catch {
    // The restored data simply has no logo; it can be chosen again in Settings.
  }
  clearStep(paths, 'ready');
  return { ok: true, madeOn };
}
