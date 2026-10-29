import { z } from 'zod';
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityEntry,
  type ActivityPage,
  type ActivityQuery,
  type AuditAction,
  type AuditEntity,
} from '@shared/audit';
import { CURRENCIES, type Currency } from '@shared/currency';
import { yearMonthSchema } from '@shared/dates';
import { PART_SEPARATOR } from '@shared/reportText';
import type { Db } from '../connection';

interface ActivityRow {
  id: number;
  at: string;
  action: AuditAction;
  entity: AuditEntity;
  details_json: string;
  /** The area's own name, or the category's name for a category entry. */
  name: string | null;
  /** The category of the entry's area, which names an area without a name of its own. */
  area_category: string | null;
  /** The renter a receipt was written for. */
  receipt_renter: string | null;
  /** The current renter of an area, for entries that do not record a renter. */
  renter_now: string | null;
  currency: Currency | null;
  receipt_number: number | null;
}

// Each field is read on its own: one that is missing or unexpected is left out
// of the line, and never hides the others.
const amount = z.number().int().nonnegative().optional().catch(undefined);
const text = z.string().optional().catch(undefined);
const change = z.object({ amount, name: text }).nullable().optional().catch(undefined);

/** The parts of the stored details the log shows (see the `audit.record` calls). */
const detailsSchema = z.object({
  name: text,
  amount,
  monthlyPrice: amount,
  previousPrice: amount,
  from: yearMonthSchema.optional().catch(undefined),
  currency: z.enum(CURRENCIES).optional().catch(undefined),
  previousCurrency: z.enum(CURRENCIES).optional().catch(undefined),
  renter: text,
  before: change,
  after: change,
});

function readDetails(json: string): z.infer<typeof detailsSchema> {
  try {
    const parsed = detailsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function toEntry(row: ActivityRow): ActivityEntry {
  const details = readDetails(row.details_json);
  return {
    id: row.id,
    at: row.at,
    action: row.action,
    entity: row.entity,
    // An area without a name is shown by its category and its renter: the one
    // recorded with the entry when there is one (so history keeps the renter of
    // that time), else today's.
    name:
      row.name ??
      (row.area_category === null
        ? null
        : [row.area_category, details.renter ?? row.receipt_renter ?? row.renter_now]
            .filter(Boolean)
            .join(PART_SEPARATOR)) ??
      (details.name || details.after?.name || null),
    // Recorded with the entry since a new renter may pay in another currency; older entries
    // have the area's first currency, the only one there was then.
    currency: details.currency ?? row.currency,
    previousCurrency: details.previousCurrency ?? details.currency ?? row.currency,
    amount: details.after?.amount ?? details.amount ?? details.monthlyPrice ?? null,
    previousAmount: details.before?.amount ?? details.previousPrice ?? null,
    month: details.from ?? null,
    renter: details.renter ?? null,
    receiptNumber: row.receipt_number,
  };
}

/** The read-only activity log (ARCHITECTURE.md section 8.10), newest first, a page at a time. */
export function createActivityRepository(db: Db) {
  const selectPage = db.prepare<[number | null, number | null, number], ActivityRow>(
    `SELECT l.id, l.at, l.action, l.entity, l.details_json,
            -- An area without a name is shown by its category and renter (see toEntry);
            -- a receipt by the renter it was written for.
            COALESCE(NULLIF(a.name, ''), NULLIF(receipt_area.name, ''), c.name) AS name,
            area_category.name AS area_category,
            r.renter_name_snapshot AS receipt_renter,
            area_renter.full_name AS renter_now,
            COALESCE(r.currency, (
              SELECT p.currency FROM area_prices p WHERE p.area_id = a.id
              ORDER BY p.effective_from_year, p.effective_from_month LIMIT 1)) AS currency,
            r.receipt_number
       FROM audit_log l
       LEFT JOIN areas a ON l.entity = 'area' AND a.id = l.entity_id
       LEFT JOIN categories c ON l.entity = 'category' AND c.id = l.entity_id
       LEFT JOIN receipts r ON l.entity = 'receipt' AND r.id = l.entity_id
       LEFT JOIN areas receipt_area ON receipt_area.id = r.area_id
       LEFT JOIN categories area_category
              ON area_category.id = COALESCE(a.category_id, receipt_area.category_id)
       LEFT JOIN renters area_renter ON area_renter.area_id = a.id AND area_renter.ended_on IS NULL
      WHERE ? IS NULL OR l.id < ?
      ORDER BY l.id DESC
      LIMIT ?`,
  );
  return {
    page({ beforeId }: ActivityQuery): ActivityPage {
      // One extra row says whether there is more, without counting the whole log.
      const rows = selectPage.all(beforeId, beforeId, ACTIVITY_PAGE_SIZE + 1);
      return {
        entries: rows.slice(0, ACTIVITY_PAGE_SIZE).map(toEntry),
        hasMore: rows.length > ACTIVITY_PAGE_SIZE,
      };
    },
  };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
