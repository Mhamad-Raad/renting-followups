import { stat, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { LOGO_MAX_BYTES, settingsUpdateSchema, type LogoChoiceResult } from '@shared/settings';
import type { SettingsRepository } from '../db/repositories/settings';
import { askToOpen } from '../services/dialogs';
import type { LogoStore } from '../services/logo';
import { translate } from '../services/translate';
import { handle } from './handle';

export function registerSettingsIpc(settings: SettingsRepository, logo: LogoStore): void {
  handle('settings:get', z.undefined(), () => settings.getAll());
  handle('settings:update', settingsUpdateSchema, (changes) => settings.update(changes));
  handle('settings:logo', z.undefined(), () => logo.read());
  handle('settings:chooseLogo', z.undefined(), async (): Promise<LogoChoiceResult> => {
    const path = await askToOpen({
      properties: ['openFile'],
      filters: [
        {
          name: translate(settings.getAll().language, 'settings.pictures'),
          extensions: ['png', 'jpg', 'jpeg'],
        },
      ],
    });
    if (!path) return { ok: true, done: 'cancelled' };
    // Checked before reading, so a huge file is never loaded.
    if ((await stat(path)).size > LOGO_MAX_BYTES) return { ok: false, reason: 'too_large' };
    const saved = logo.save(await readFile(path));
    return saved.ok ? { ok: true, done: 'saved' } : saved;
  });
  handle('settings:removeLogo', z.undefined(), () => {
    logo.remove();
    return null;
  });
}
