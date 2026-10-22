import type { Repositories } from '../db/repositories';
import type { AuthService } from '../services/auth';
import type { LogoStore } from '../services/logo';
import { registerAreaIpc } from './areas';
import { registerAuthIpc } from './auth';
import { registerCategoryIpc } from './categories';
import { setUnlockCheck } from './handle';
import { registerHomeIpc } from './home';
import { registerLogIpc } from './log';
import { registerNotificationIpc } from './notifications';
import { registerPaymentIpc } from './payments';
import { registerPrintIpc } from './print';
import { registerReportIpc } from './reports';
import { registerSettingsIpc } from './settings';

export interface IpcDependencies {
  repos: Repositories;
  auth: AuthService;
  logo: LogoStore;
}

let registered = false;

/** Registers every IPC handler exactly once for the life of the app. */
export function registerIpcHandlers({ repos, auth, logo }: IpcDependencies): void {
  if (registered) throw new Error('IPC handlers are already registered');
  registered = true;
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
}
