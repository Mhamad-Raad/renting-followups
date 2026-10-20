import { ipcMain } from 'electron';
import type { z } from 'zod';
import type { IpcChannel, IpcInput, IpcOutput, IpcResult } from '@shared/ipc';
import { isAppUrl } from '../security';
import { describeError, logger } from '../services/logger';

type Handler<C extends IpcChannel> = (input: IpcInput<C>) => IpcOutput<C> | Promise<IpcOutput<C>>;

/**
 * Registers the one handler for a channel. The renderer is never trusted: the
 * sender must be the app's own page and the input must pass the zod schema.
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
