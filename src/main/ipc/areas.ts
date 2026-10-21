import { z } from 'zod';
import {
  areaCreateSchema,
  areaListQuerySchema,
  areaUpdateSchema,
  areaYearQuerySchema,
  priceChangeSchema,
  renterChangeSchema,
} from '@shared/areas';
import { idInputSchema } from '@shared/categories';
import type { Repositories } from '../db/repositories';
import { currentYearMonth } from '../services/clock';
import { handle } from './handle';

export function registerAreaIpc({ areas, categories }: Repositories): void {
  handle('areas:list', areaListQuerySchema, (query) => areas.list(query, currentYearMonth()));
  handle('areas:get', idInputSchema, ({ id }) => areas.get(id));
  handle('areas:year', areaYearQuerySchema, ({ id, year, month }) =>
    areas.year(id, year, currentYearMonth(), month),
  );
  handle('areas:create', areaCreateSchema, (input) => areas.create(input));
  handle('areas:update', areaUpdateSchema, (input) => areas.update(input));
  handle('areas:priceChangeImpact', priceChangeSchema, (input) =>
    areas.priceChangeImpact(input, currentYearMonth()),
  );
  handle('areas:changePrice', priceChangeSchema, (input) => areas.changePrice(input));
  handle('areas:changeRenter', renterChangeSchema, (input) => areas.changeRenter(input));
  handle('areas:delete', idInputSchema, ({ id }) => areas.softDelete(id));
  handle('areas:restore', idInputSchema, ({ id }) => areas.restore(id));
  handle('deleted:list', z.undefined(), () => ({
    areas: areas.listDeleted(),
    categories: categories.listDeleted(),
  }));
}
