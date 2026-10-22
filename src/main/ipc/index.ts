import { z } from 'zod';
import { DEFAULT_SETTINGS } from '@shared/settings';
import type { Db } from '../db/connection';
import type { Repositories } from '../db/repositories';
import type { AuthService } from '../services/auth';
import type { LogoStore } from '../services/logo';
import { registerActivityIpc } from './activity';
import { registerAreaIpc } from './areas';
import { registerAuthIpc } from './auth';
import { registerBackupIpc, registerRestoreIpc, type RestoreDependencies } from './backup';
import { registerCategoryIpc } from './categories';
import { handle, setUnlockCheck } from './handle';
import { registerHomeIpc } from './home';
import { registerImportIpc } from './import';
import { registerLogIpc } from './log';
import { registerNotificationIpc } from './notifications';
import { registerPaymentIpc } from './payments';
import { registerPrintIpc } from './print';
import { registerReportIpc } from './reports';
import { registerSettingsIpc } from './settings';

export interface IpcDependencies {
  db: Db;
  repos: Repositories;
  auth: AuthService;
  logo: LogoStore;
  dataDirectory: string;
  restore: RestoreDependencies;
}

let registered = false;

function registerOnce(): void {
  if (registered) throw new Error('IPC handlers are already registered');
  registered = true;
}

/** Registers every IPC handler exactly once for the life of the app. */
export function registerIpcHandlers(deps: IpcDependencies): void {
  const { repos, auth, logo } = deps;
  registerOnce();
  setUnlockCheck(() => auth.isUnlocked());
  registerSettingsIpc(repos.settings, logo);
  registerLogIpc();
  registerAuthIpc(auth);
  registerCategoryIpc(repos);
  registerAreaIpc(repos);
  registerPaymentIpc(repos);
  registerHomeIpc(repos);
  registerReportIpc(repos);
  registerPrintIpc(repos);
  registerNotificationIpc(repos);
  registerActivityIpc(repos);
  registerImportIpc(deps.db, repos);
  registerRestoreIpc(deps.restore);
  registerBackupIpc({
    db: deps.db,
    backupSettings: repos.backupSettings,
    logo,
    dataDirectory: deps.dataDirectory,
    language: deps.restore.language,
  });
}

/**
 * The damaged-data screen: the data file cannot be read, so there is no
 * password to check and nothing to protect in it. Only the screen's language,
 * crash reports and restoring a backup are offered; no other channel exists.
 */
export function registerRecoveryIpcHandlers(restore: RestoreDependencies): void {
  registerOnce();
  setUnlockCheck(() => true);
  handle('settings:get', z.undefined(), () => ({
    ...DEFAULT_SETTINGS,
    language: restore.language(),
  }));
  handle('auth:status', z.undefined(), () => 'damaged' as const);
  registerLogIpc();
  registerRestoreIpc(restore);
}
