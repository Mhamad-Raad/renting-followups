import { compareAreaLabels } from '@shared/areas';
import type { CategoryColor } from '@shared/categories';
import type { Currency } from '@shared/currency';
import type { YearMonth } from '@shared/dates';
import type { Language } from '@shared/settings';
import {
  DEFAULT_REPORT_FILTERS,
  reportFiltersSchema,
  type Report,
  type ReportFilters,
  type ReportQuery,
  type ReportRow,
} from '@shared/reports';
import {
  areaYear,
  matchesReportStatus,
  NO_PAYMENTS,
  reportTotals,
} from '../../services/monthStatus';
import type { Db } from '../connection';
import type { PaidRepository } from './paid';
import type { PriceRepository } from './prices';
import { createKeyValueStore } from './settings';

interface ReportRecord {
  id: number;
  name: string;
  currency: Currency;
  notes: string;
  category_name: string;
  category_color: CategoryColor | null;
  renter_name: string | null;
  renter_phone: string | null;
}

const FILTERS_KEY = 'report_filters_last_used';

interface Dependencies {
  paid: PaidRepository;
  prices: PriceRepository;
}

/** The Reports page: one row per area with its figures and months, and totals per currency. */
export function createReportRepository(db: Db, { paid, prices }: Dependencies) {
  const selectAreas = db.prepare<
    { categoryId: number | null; currency: Currency | null },
    ReportRecord
  >(
    `SELECT a.id, a.name, a.currency, a.notes,
       c.name AS category_name, c.color AS category_color,
       r.full_name AS renter_name, r.phone AS renter_phone
     FROM areas a
     JOIN categories c ON c.id = a.category_id
     LEFT JOIN renters r ON r.area_id = a.id AND r.ended_on IS NULL
     WHERE a.deleted_at IS NULL
       AND (@categoryId IS NULL OR a.category_id = @categoryId)
       AND (@currency IS NULL OR a.currency = @currency)`,
  );
  const store = createKeyValueStore(db);

  return {
    /** Every query is one pass over the areas, their prices and the year's payments (no query per area). */
    build(query: ReportQuery, today: YearMonth, language: Language): Report {
      const areas = selectAreas.all({ categoryId: query.categoryId, currency: query.currency });
      const excluded = new Set(query.excludedIds);
      const only = query.onlyIds && new Set(query.onlyIds);
      const pricesByArea = prices.forActiveAreas();
      const paidByArea = paid.inYear(query.year);
      const rows: ReportRow[] = [];
      for (const area of areas) {
        if (excluded.has(area.id) || (only && !only.has(area.id))) continue;
        const year = areaYear(
          pricesByArea.get(area.id) ?? [],
          paidByArea.get(area.id) ?? NO_PAYMENTS,
          query.year,
          today,
          query.month,
        );
        if (!matchesReportStatus(year.boxes, query.status, query.month)) continue;
        rows.push({
          id: area.id,
          name: area.name,
          categoryName: area.category_name,
          categoryColor: area.category_color,
          currency: area.currency,
          renterName: area.renter_name,
          renterPhone: area.renter_phone,
          notes: area.notes,
          figures: year.figures,
          boxes: year.boxes,
          summary: year.summary,
          monthStatus:
            query.month === null
              ? null
              : (year.boxes.find((box) => box.month === query.month)?.status ?? null),
        });
      }
      // Sorted here, once, so the screen, the printed report and Excel list areas in the same order.
      const byName = compareAreaLabels(new Intl.Collator(language));
      return {
        candidates: areas
          .map((area) => ({
            id: area.id,
            name: area.name,
            renterName: area.renter_name,
            categoryName: area.category_name,
          }))
          .sort(byName),
        rows: rows.sort(byName),
        totals: reportTotals(rows),
      };
    },

    /** The last-used filters (all but the year); the defaults if none or unreadable. */
    lastFilters(): ReportFilters {
      const stored = store.read(FILTERS_KEY);
      if (!stored) return DEFAULT_REPORT_FILTERS;
      try {
        const parsed = reportFiltersSchema.safeParse(JSON.parse(stored));
        return parsed.success ? parsed.data : DEFAULT_REPORT_FILTERS;
      } catch {
        return DEFAULT_REPORT_FILTERS;
      }
    },

    rememberFilters(filters: ReportFilters): void {
      store.write(FILTERS_KEY, JSON.stringify(filters));
    },
  };
}

export type ReportRepository = ReturnType<typeof createReportRepository>;
