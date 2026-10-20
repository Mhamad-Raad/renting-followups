import { z } from 'zod';
import { categoryInputSchema, categoryUpdateSchema, idInputSchema } from '@shared/categories';
import type { Repositories } from '../db/repositories';
import { handle } from './handle';

export function registerCategoryIpc({ categories }: Repositories): void {
  handle('categories:list', z.undefined(), () => categories.list());
  handle('categories:create', categoryInputSchema, (input) => categories.create(input));
  handle('categories:update', categoryUpdateSchema, (input) => categories.update(input));
  handle('categories:delete', idInputSchema, ({ id }) => categories.softDelete(id));
  handle('categories:restore', idInputSchema, ({ id }) => categories.restore(id));
}
