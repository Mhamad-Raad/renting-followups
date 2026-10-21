import type { Repositories } from '../db/repositories';
import type { AuthService } from '../services/auth';
import { registerAreaIpc } from './areas';
import { registerAuthIpc } from './auth';
import { registerCategoryIpc } from './categories';
import { setUnlockCheck } from './handle';
import { registerHomeIpc } from './home';
import { registerLogIpc } from './log';
import { registerPaymentIpc } from './payments';
import { registerSettingsIpc } from './settings';

export interface IpcDependencies {
  repos: Repositories;
  auth: AuthService;
}

let registered = false;

/** Registers every IPC handler exactly once for the life of the app. */
export function registerIpcHandlers({ repos, auth }: IpcDependencies): void {
  if (registered) throw new Error('IPC handlers are already registered');
  registered = true;
  setUnlockCheck(() => auth.isUnlocked());
  registerSettingsIpc(repos.settings);
  registerLogIpc();
  registerAuthIpc(auth);
  registerCategoryIpc(repos);
  registerAreaIpc(repos);
  registerPaymentIpc(repos);
  registerHomeIpc(repos);
}
