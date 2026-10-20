import type { SettingsRepository } from '../db/repositories/settings';
import { registerLogIpc } from './log';
import { registerSettingsIpc } from './settings';

export interface IpcDependencies {
  settings: SettingsRepository;
}

let registered = false;

/** Registers every IPC handler exactly once for the life of the app. */
export function registerIpcHandlers(dependencies: IpcDependencies): void {
  if (registered) throw new Error('IPC handlers are already registered');
  registered = true;
  registerSettingsIpc(dependencies.settings);
  registerLogIpc();
}
