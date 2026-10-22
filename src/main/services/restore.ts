import {
  copyFileSync,
  existsSync,
  mkdirSync,
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
import { logoFileName, type LogoKind } from './logo';

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

export const LOGO_KINDS: readonly LogoKind[] = ['png', 'jpg'];

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
