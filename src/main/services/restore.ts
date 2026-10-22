import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { BackupInfo, RestoreOutcome } from '@shared/backup';
import type { DateString } from '@shared/dates';
import { safetyCopyName } from './backup';
import { LOGO_KINDS, logoFileName, type LogoKind } from './logo';

/**
 * Restore (ARCHITECTURE.md section 13) in two steps, so the data file is
 * never replaced while it is open:
 *
 * 1. `checkBackup` (backupCheck.ts) copies the chosen file into the app's
 *    `restore` folder and checks it. The owner then sees what it holds and
 *    confirms; `confirmRestore` marks it ready.
 * 2. The app restarts, and before it opens the database `applyReadyRestore`
 *    keeps a safety copy of the current data and puts the backup in its place.
 *    An older backup is then upgraded by the normal migrations.
 */

/** The journal files SQLite keeps beside a database. */
const JOURNALS = ['-wal', '-shm'] as const;

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

export const pending = (paths: RestorePaths) => join(paths.staging, 'pending.db');
const ready = (paths: RestorePaths) => join(paths.staging, 'ready.db');
export const stagedLogo = (paths: RestorePaths, step: 'pending' | 'ready', kind: LogoKind) =>
  join(paths.staging, `${step}-logo.${kind}`);
const readyInfo = (paths: RestorePaths) => join(paths.staging, 'ready.json');

export function clearStep(paths: RestorePaths, step: 'pending' | 'ready'): void {
  rmSync(join(paths.staging, `${step}.db`), { force: true });
  for (const kind of LOGO_KINDS) rmSync(stagedLogo(paths, step, kind), { force: true });
  if (step === 'ready') rmSync(readyInfo(paths), { force: true });
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

/**
 * The highest receipt number a database has given out (its counter, or its
 * highest receipt); 0 when it cannot be read. A restore keeps counting from
 * the higher of the old and the restored data, so no number is given twice.
 */
export function highestReceiptNumber(file: string): number {
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const counter = db
        .prepare("SELECT value FROM settings WHERE key = 'last_receipt_number'")
        .get() as { value: string } | undefined;
      const hasReceipts =
        db
          .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'receipts'")
          .get() !== undefined;
      const highest = hasReceipts
        ? ((
            db.prepare('SELECT MAX(receipt_number) AS highest FROM receipts').get() as {
              highest: number | null;
            }
          ).highest ?? 0)
        : 0;
      return Math.max(Number(counter?.value ?? 0) || 0, highest);
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

/**
 * The highest receipt number in any readable safety copy, for when the data
 * file itself cannot be read: the best known number it had reached. Each copy
 * is read from a scratch copy, as SQLite would add files beside the original.
 */
function highestInSafetyCopies(folder: string, scratch: string): number {
  let highest = 0;
  for (const name of readdirSync(folder).filter((file) => file.endsWith('.db'))) {
    try {
      for (const suffix of ['', '-wal']) {
        copyIfPresent(join(folder, `${name}${suffix}`), `${scratch}${suffix}`);
      }
      highest = Math.max(highest, highestReceiptNumber(scratch));
    } finally {
      for (const suffix of ['', ...JOURNALS]) rmSync(`${scratch}${suffix}`, { force: true });
    }
  }
  return highest;
}

/** Makes sure the database's receipt counter is at least `atLeast`. */
export function raiseReceiptCounter(file: string, atLeast: number): void {
  if (atLeast <= highestReceiptNumber(file)) return;
  const db = new Database(file, { fileMustExist: true });
  try {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('last_receipt_number', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    ).run(String(atLeast));
  } finally {
    db.close();
  }
}

const RENAME_TRIES = 5;
const RENAME_WAIT_MS = 200;

/**
 * Renames, trying again for a moment if the file is briefly held by another
 * program (on Windows, a virus scanner or a sync tool can do this).
 */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      if (attempt >= RENAME_TRIES) throw error;
      // A short wait at startup, before any window exists; nothing else is waiting on this.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_WAIT_MS);
    }
  }
}

/** Copies a file if it exists. */
function copyIfPresent(from: string, to: string): void {
  if (existsSync(from)) copyFileSync(from, to);
}

/**
 * Folds any changes still in the journal (left by a crash) into the data file,
 * so the file on its own is complete. Returns false when that is not possible
 * (a damaged file); SQLite may then remove the journal, so it must already be
 * in the safety copy.
 */
function foldJournal(database: string): boolean {
  try {
    const old = new Database(database, { fileMustExist: true });
    try {
      old.pragma('wal_checkpoint(TRUNCATE)');
      return true;
    } finally {
      old.close();
    }
  } catch {
    return false;
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
  const safety = join(paths.safetyFolder, safetyCopyName('before-restore', now));
  let folded = false;
  try {
    // First an exact copy of the files as they are, before SQLite touches them.
    mkdirSync(paths.safetyFolder, { recursive: true });
    for (const suffix of ['', ...JOURNALS]) {
      copyIfPresent(`${paths.database}${suffix}`, `${safety}.db${suffix}`);
    }
    for (const kind of LOGO_KINDS) {
      copyIfPresent(join(paths.logoFolder, logoFileName(kind)), `${safety}.logo.${kind}`);
    }
    folded = foldJournal(paths.database);
    // Receipts printed after the backup was made keep their numbers: counting goes on from the higher one.
    raiseReceiptCounter(
      ready(paths),
      folded
        ? highestReceiptNumber(paths.database)
        : highestInSafetyCopies(paths.safetyFolder, join(paths.staging, 'reading.db')),
    );
    // A journal left over would be applied to the backup and spoil it; it is in the safety copy.
    for (const suffix of JOURNALS) rmSync(`${paths.database}${suffix}`, { force: true });
    renameWithRetry(ready(paths), paths.database);
  } catch {
    // Put the journal back if it was not folded in, so the current data is exactly as before.
    if (!folded) {
      for (const suffix of JOURNALS) {
        try {
          copyIfPresent(`${safety}.db${suffix}`, `${paths.database}${suffix}`);
        } catch {
          // Still safe: the journal is in the safety copies folder.
        }
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
