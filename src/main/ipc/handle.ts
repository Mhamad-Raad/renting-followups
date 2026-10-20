import { ipcMain } from 'electron';
import type { z } from 'zod';
import {
  OPEN_WHILE_LOCKED,
  type IpcChannel,
  type IpcInput,
  type IpcOutput,
  type IpcResult,
} from '@shared/ipc';
import { isAppUrl } from '../security';
import { describeError, logger } from '../services/logger';

let isUnlocked: () => boolean = () => false;

/** Tells the handlers how to know whether the password has been entered. Called once at startup. */
export function setUnlockCheck(check: () => boolean): void {
  isUnlocked = check;
}

type Handler<C extends IpcChannel> = (input: IpcInput<C>) => IpcOutput<C> | Promise<IpcOutput<C>>;

/**
 * Registers the one handler for a channel. The renderer is never trusted: the
 * sender must be the app's own page, the app must be unlocked (except for the
 * few channels the lock screen needs), and the input must pass the zod schema.
 * Failures return an error code; details go to the log only.
 */
export function handle<C extends IpcChannel>(
  channel: C,
  schema: z.ZodType<IpcInput<C>>,
  handler: Handler<C>,
): void {
  ipcMain.handle(channel, async (event, payload: unknown): Promise<IpcResult<IpcOutput<C>>> => {
    if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) {
      logger.warn('ipc.untrusted_sender', { channel });
      return { ok: false, error: 'invalid_input' };
    }
    if (!OPEN_WHILE_LOCKED[channel] && !isUnlocked()) {
      logger.warn('ipc.locked', { channel });
      return { ok: false, error: 'locked' };
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)');
      logger.warn('ipc.invalid_input', { channel, paths: paths.join(',') });
      return { ok: false, error: 'invalid_input' };
    }
    try {
      return { ok: true, data: await handler(parsed.data) };
    } catch (error) {
      logger.error('ipc.failed', { channel, ...describeError(error) });
      return { ok: false, error: 'unexpected' };
    }
  });
}
