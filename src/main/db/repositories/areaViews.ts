import type { AreaListItem, AreaListQuery } from '@shared/areas';
import type { CategoryColor } from '@shared/categories';
import type { Currency } from '@shared/currency';
import type { YearMonth } from '@shared/dates';
import type { AttentionItem } from '@shared/home';
import type { AreaYear } from '@shared/months';
import { normalizePhone, normalizeText } from '@shared/normalizeText';
import { priceForMonth } from '@shared/prices';
import { areaStanding, areaYear, NO_PAYMENTS, type AreaOverview } from '../../services/monthStatus';
import type { ReminderArea } from '../../services/notifications';
import type { Db } from '../connection';
import type { AreaRepository } from './areas';
import type { PaidRepository } from './paid';
import type { PriceRepository } from './prices';
import { containsPattern } from './sql';

interface AreaListRecord {
  id: number;
  name: string;
  currency: Currency;
  category_id: number;
  category_name: string;
  category_color: CategoryColor | null;
  renter_name: string | null;
  renter_phone: string | null;
}

interface Dependencies {
  areas: AreaRepository;
  paid: PaidRepository;
  prices: PriceRepository;
}

/** Areas as the screens read them, with their month colours and figures from `monthStatus.ts`. */
export function createAreaViewRepository(db: Db, { areas, paid, prices }: Dependencies) {
  const selectList = db.prepare<
    { categoryId: number | null; namePattern: string; phonePattern: string | null },
    AreaListRecord
  >(
    `SELECT a.id, a.name, a.currency, a.category_id,
       c.name AS category_name, c.color AS category_color,
       r.full_name AS renter_name, r.phone AS renter_phone
     FROM areas a
     JOIN categories c ON c.id = a.category_id
     LEFT JOIN renters r ON r.area_id = a.id AND r.ended_on IS NULL
     WHERE a.deleted_at IS NULL
       AND (@categoryId IS NULL OR a.category_id = @categoryId)
       AND (a.name_normalized LIKE @namePattern ESCAPE '\\'
         OR r.full_name_normalized LIKE @namePattern ESCAPE '\\'
         OR (@phonePattern IS NOT NULL AND r.phone_digits LIKE @phonePattern ESCAPE '\\'))`,
  );

  return {
    /** Areas in use, optionally in one category and matching a search on area name, renter name or phone. */
    list({ search, categoryId }: AreaListQuery, today: YearMonth): AreaListItem[] {
      const query = normalizeText(search);
      const digits = normalizePhone(search);
      const pricesByArea = prices.forActiveAreas();
      const paidByArea = paid.inYear(today.year);
      return selectList
        .all({
          categoryId,
          namePattern: containsPattern(query),
          phonePattern: digits === '' ? null : containsPattern(digits),
        })
        .map((row) => {
          const history = pricesByArea.get(row.id) ?? [];
          const paid = paidByArea.get(row.id) ?? NO_PAYMENTS;
          const { boxes, summary } = areaYear(history, paid, today.year, today);
          return {
            id: row.id,
            name: row.name,
            categoryId: row.category_id,
            categoryName: row.category_name,
            categoryColor: row.category_color,
            currency: row.currency,
            renterName: row.renter_name,
            renterPhone: row.renter_phone,
            currentPrice: priceForMonth(history, today),
            months: boxes,
            summary,
          };
        });
    },

    /** One year of an area: its 12 month boxes, summary word, and figures for the year or one month. */
    year(id: number, year: number, today: YearMonth, month: number | null = null): AreaYear | null {
      if (!areas.isActive(id)) return null;
      return areaYear(prices.forArea(id), paid.inAreaYear(id, year), year, today, month);
    },

    /** Every area in use with its whole price and payment history, for the reminders. */
    reminderAreas(): ReminderArea[] {
      const pricesByArea = prices.forActiveAreas();
      const historyByArea = paid.historyForActiveAreas();
      return selectList
        .all({ categoryId: null, namePattern: containsPattern(''), phonePattern: null })
        .map((row) => ({
          id: row.id,
          name: row.name,
          currency: row.currency,
          renterName: row.renter_name,
          renterPhone: row.renter_phone,
          prices: pricesByArea.get(row.id) ?? [],
          paid: historyByArea.get(row.id) ?? new Map(),
        }));
    },

    /** Every area in use with this year's figures and its standing today, for Home. */
    overviews(today: YearMonth): (AttentionItem & AreaOverview)[] {
      const pricesByArea = prices.forActiveAreas();
      const historyByArea = paid.historyForActiveAreas();
      const paidThisYear = paid.inYear(today.year);
      return selectList
        .all({ categoryId: null, namePattern: containsPattern(''), phonePattern: null })
        .map((row) => {
          const history = pricesByArea.get(row.id) ?? [];
          const paid = paidThisYear.get(row.id) ?? NO_PAYMENTS;
          return {
            id: row.id,
            name: row.name,
            categoryName: row.category_name,
            categoryColor: row.category_color,
            currency: row.currency,
            renterName: row.renter_name,
            renterPhone: row.renter_phone,
            figures: areaYear(history, paid, today.year, today).figures,
            standing: areaStanding(history, historyByArea.get(row.id) ?? new Map(), today),
          };
        });
    },
  };
}

export type AreaViewRepository = ReturnType<typeof createAreaViewRepository>;
