import { activityQuerySchema } from '@shared/audit';
import type { Repositories } from '../db/repositories';
import { handle } from './handle';

export function registerActivityIpc({ activity }: Repositories): void {
  handle('activity:list', activityQuerySchema, (query) => activity.page(query));
}
