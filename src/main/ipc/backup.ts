import { existsSync } from 'node:fs';
import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import { z } from 'zod';
import type {
  BackupInfo,
  BackupResult,
  BackupStatus,
  FolderChoice,
  RestoreChoice,
  RestoreOutcome,
} from '@shared/backup';
import type { Language } from '@shared/settings';
import type { Db } from '../db/connection';
import type { Migration } from '../db/migrate';
import type { BackupSettingsRepository } from '../db/repositories/settings';
import { BackupFolderMissingError, createBackup, isSameDrive } from '../services/backup';
import { businessToday } from '../services/clock';
import { describeError, logger } from '../services/logger';
import type { LogoStore } from '../services/logo';
import { checkBackup } from '../services/backupCheck';
import { clearStep, confirmRestore, type RestorePaths } from '../services/restore';
import { translate } from '../services/translate';
import { handle } from './handle';

async function showOpenDialog(options: OpenDialogOptions): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow();
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

export interface RestoreDependencies {
  paths: RestorePaths;
  migrations: readonly Migration[];
  /** The language for the file dialog's labels. */
  language: () => Language;
  /** How the restore at this start went; null when there was none. */
  outcome: RestoreOutcome | null;
  /** Closes the app and starts it again, which puts a confirmed backup in place. */
  restart: () => void;
}

/**
 * Choosing and confirming a restore. Also used on the damaged-data screen,
 * where no password can be checked, so it needs nothing from the database.
 */
/** The backup being written, if any; a restore waits for it. */
let backupRunning: Promise<unknown> | null = null;

export function registerRestoreIpc(deps: RestoreDependencies): void {
  let checked: BackupInfo | null = null;

  handle('restore:result', z.undefined(), () => deps.outcome);

  handle('restore:choose', z.undefined(), async (): Promise<RestoreChoice> => {
    checked = null;
    const source = await showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: translate(deps.language(), 'backup.files'), extensions: ['db'] }],
    });
    if (!source) return { ok: true, done: 'cancelled' };
    try {
      const { check, info } = checkBackup(source, deps.paths, deps.migrations);
      if (!check.ok || !info) return check.ok ? { ok: false, reason: 'failed' } : check;
      checked = info;
      return { ok: true, done: 'checked', info };
    } catch (error) {
      logger.error('restore.check_failed', describeError(error));
      return { ok: false, reason: 'failed' };
    }
  });

  handle('restore:apply', z.undefined(), async () => {
    // Only a backup checked in this session can be restored; the screen never sends a path.
    if (!checked || !confirmRestore(deps.paths, checked)) return { ok: false };
    logger.info('restore.confirmed', { madeOn: checked.madeOn });
    // A backup still being written is finished first; the restart would cut it off.
    await backupRunning;
    deps.restart();
    return { ok: true };
  });

  handle('restore:cancel', z.undefined(), () => {
    checked = null;
    clearStep(deps.paths, 'pending');
    return null;
  });
}

export interface BackupDependencies {
  db: Db;
  backupSettings: BackupSettingsRepository;
  logo: LogoStore;
  dataDirectory: string;
  language: () => Language;
}

export function registerBackupIpc(deps: BackupDependencies): void {
  const { backupSettings } = deps;

  const askForFolder = () =>
    showOpenDialog({
      title: translate(deps.language(), 'backup.chooseFolder'),
      properties: ['openDirectory', 'createDirectory'],
    });

  handle('backup:status', z.undefined(), (): BackupStatus => {
    const folder = backupSettings.folder();
    const present = folder !== null && existsSync(folder);
    return {
      folder,
      folderMissing: folder !== null && !present,
      sameDrive: present && isSameDrive(folder, deps.dataDirectory),
      lastBackupOn: backupSettings.lastBackupOn(),
    };
  });

  handle('backup:chooseFolder', z.undefined(), async (): Promise<FolderChoice> => {
    const folder = await askForFolder();
    if (!folder) return { ok: true, done: 'cancelled' };
    backupSettings.setFolder(folder);
    return { ok: true, done: 'chosen' };
  });

  // Uses the saved folder; asks for one the first time.
  const backUp = async (): Promise<BackupResult> => {
    try {
      let folder = backupSettings.folder();
      if (!folder) {
        folder = await askForFolder();
        if (!folder) return { ok: true, done: 'cancelled' };
        backupSettings.setFolder(folder);
      }
      const today = businessToday().date;
      const fileName = await createBackup(deps.db, folder, today, deps.logo.file());
      backupSettings.setLastBackupOn(today);
      logger.info('backup.saved', {});
      return { ok: true, done: 'saved', fileName };
    } catch (error) {
      if (error instanceof BackupFolderMissingError) return { ok: false, reason: 'folder_missing' };
      logger.error('backup.failed', describeError(error));
      return { ok: false, reason: 'failed' };
    }
  };

  handle('backup:now', z.undefined(), async (): Promise<BackupResult> => {
    if (backupRunning) return { ok: false, reason: 'failed' };
    const running = backUp();
    backupRunning = running;
    try {
      return await running;
    } finally {
      backupRunning = null;
    }
  });
}
