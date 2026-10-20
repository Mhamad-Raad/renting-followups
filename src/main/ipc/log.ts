import { z } from 'zod';
import { logger } from '../services/logger';
import { handle } from './handle';

const rendererErrorSchema = z.object({
  name: z.string().max(100),
  stack: z.string().max(4000),
});

export function registerLogIpc(): void {
  handle('log:rendererError', rendererErrorSchema, (report) => {
    logger.error('renderer.crash', { errorName: report.name, stack: report.stack });
    return null;
  });
}
