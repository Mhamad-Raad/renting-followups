import { z } from 'zod';
import { reportFiltersSchema, reportQuerySchema } from '@shared/reports';
import type { Repositories } from '../db/repositories';
import { currentYearMonth } from '../services/clock';
import { handle } from './handle';

export function registerReportIpc({ reports }: Repositories): void {
  handle('reports:build', reportQuerySchema, (query) => reports.build(query, currentYearMonth()));
  handle('reports:lastFilters', z.undefined(), () => reports.lastFilters());
  handle('reports:rememberFilters', reportFiltersSchema, (filters) => {
    reports.rememberFilters(filters);
    return null;
  });
}
