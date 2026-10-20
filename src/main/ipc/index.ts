import type { SettingsRepository } from '../db/repositories/settings';
import type { AuthService } from '../services/auth';
import { registerAuthIpc } from './auth';
import { setUnlockCheck } from './handle';
import { registerLogIpc } from './log';
import { registerSettingsIpc } from './settings';

export interface IpcDependencies {
  settings: SettingsRepository;
  auth: AuthService;
}

let registered = false;

/** Registers every IPC handler exactly once for the life of the app. */
export function registerIpcHandlers(dependencies: IpcDependencies): void {
  if (registered) throw new Error('IPC handlers are already registered');
  registered = true;
  setUnlockCheck(() => dependencies.auth.isUnlocked());
  registerSettingsIpc(dependencies.settings);
  registerLogIpc();
  registerAuthIpc(dependencies.auth);
}
