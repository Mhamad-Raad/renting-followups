import { z } from 'zod';
import type { AreaNaming } from './areas';
import type { CategoryColor } from './categories';
import { CURRENCIES, type Currency } from './currency';
import { monthSchema, yearSchema } from './dates';
import type { CurrencyFigures, MonthBox, MonthStatus, YearSummary } from './months';

export const REPORT_STATUSES = ['all', 'paid', 'partial', 'late'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

const id = z.number().int().positive();

/** The filters remembered between visits; the year always starts at the current one. */
export const reportFiltersSchema = z
  .object({
    month: monthSchema.nullable(),
    categoryId: id.nullable(),
    currency: z.enum(CURRENCIES).nullable(),
    status: z.enum(REPORT_STATUSES),
  })
  .strict();
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const DEFAULT_REPORT_FILTERS: ReportFilters = {
  month: null,
  categoryId: null,
  currency: null,
  status: 'all',
};

export const reportQuerySchema = reportFiltersSchema
  .extend({
    year: yearSchema,
    /** Areas unticked in the area picker. New areas are included until unticked. */
    excludedIds: z.array(id).max(10_000),
    /** Only these areas (Print selected, Print this area); null for every area. */
    onlyIds: z.array(id).min(1).max(10_000).nullable(),
  })
  .strict();
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export interface ReportRow {
  id: number;
  name: string;
  categoryName: string;
  categoryColor: CategoryColor | null;
  currency: Currency;
  renterName: string | null;
  renterPhone: string | null;
  notes: string;
  /**
   * For the year, or for the chosen month, per currency used in it (only the
   * chosen currency when the report is filtered by one).
   */
  figures: CurrencyFigures[];
  boxes: MonthBox[];
  summary: YearSummary;
  /** The chosen month's status, when a month is chosen. */
  monthStatus: MonthStatus | null;
}

/** One currency's total row at the bottom of the report. Currencies are never added together. */
export interface ReportTotal {
  currency: Currency;
  rent: number;
  received: number;
  remaining: number;
  areas: number;
}

export interface Report {
  /** Areas the picker offers: those matching the category and currency filters. */
  candidates: ({ id: number } & AreaNaming)[];
  rows: ReportRow[];
  totals: ReportTotal[];
}
