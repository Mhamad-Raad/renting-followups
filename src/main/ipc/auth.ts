import { z } from 'zod';
import {
  changePasswordInputSchema,
  changeRecoveryPhraseInputSchema,
  recoverInputSchema,
  setupInputSchema,
  unlockInputSchema,
} from '@shared/auth';
import type { AuthService } from '../services/auth';
import { logger } from '../services/logger';
import { handle } from './handle';

/** Secrets pass through here but are never logged: only the outcome is. */
export function registerAuthIpc(auth: AuthService): void {
  handle('auth:status', z.undefined(), () => auth.status());
  handle('auth:setup', setupInputSchema, async (input) => {
    const result = await auth.setup(input);
    logger.info('auth.setup', { ok: result.ok });
    return result;
  });
  handle('auth:unlock', unlockInputSchema, async ({ password }) => {
    const result = await auth.unlock(password);
    logger.info('auth.unlock', { ok: result.ok });
    return result;
  });
  handle('auth:recover', recoverInputSchema, async (input) => {
    const result = await auth.recover(input);
    logger.info('auth.recover', { ok: result.ok });
    return result;
  });
  handle('auth:changePassword', changePasswordInputSchema, async (input) => {
    const result = await auth.changePassword(input);
    logger.info('auth.change_password', { ok: result.ok });
    return result;
  });
  handle('auth:changeRecoveryPhrase', changeRecoveryPhraseInputSchema, async (input) => {
    const result = await auth.changeRecoveryPhrase(input);
    logger.info('auth.change_recovery_phrase', { ok: result.ok });
    return result;
  });
}
