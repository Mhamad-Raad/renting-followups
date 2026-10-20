import { z } from 'zod';
import { settingsUpdateSchema } from '@shared/settings';
import type { SettingsRepository } from '../db/repositories/settings';
import { handle } from './handle';

export function registerSettingsIpc(settings: SettingsRepository): void {
  handle('settings:get', z.undefined(), () => settings.getAll());
  handle('settings:update', settingsUpdateSchema, (changes) => settings.update(changes));
}
