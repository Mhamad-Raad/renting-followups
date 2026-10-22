import { z } from 'zod';
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityEntry,
  type ActivityPage,
  type ActivityQuery,
  type AuditAction,
  type AuditEntity,
} from '@shared/audit';
import type { Currency } from '@shared/currency';
import { yearMonthSchema } from '@shared/dates';
import type { Db } from '../connection';

interface ActivityRow {
  id: number;
  at: string;
  action: AuditAction;
  entity: AuditEntity;
  details_json: string;
  name: string | null;
  currency: Currency | null;
  receipt_number: number | null;
}

const amount = z.number().int().nonnegative();
const name = z.string();
const change = z.object({ amount: amount.optional(), name: name.optional() });

/**
 * The parts of the stored details the log shows (see the `audit.record`
 * calls). Anything missing or unexpected is simply left out of the line.
 */
const detailsSchema = z.object({
  name: name.optional(),
  amount: amount.optional(),
  monthlyPrice: amount.optional(),
  previousPrice: amount.nullable().optional(),
  from: yearMonthSchema.optional(),
  renter: name.nullable().optional(),
  before: change.nullable().optional(),
  after: change.nullable().optional(),
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
    name: row.name ?? details.name ?? details.after?.name ?? null,
    currency: row.currency,
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
            COALESCE(a.name, receipt_area.name, c.name) AS name,
            COALESCE(a.currency, receipt_area.currency) AS currency,
            r.receipt_number
       FROM audit_log l
       LEFT JOIN areas a ON l.entity = 'area' AND a.id = l.entity_id
       LEFT JOIN categories c ON l.entity = 'category' AND c.id = l.entity_id
       LEFT JOIN receipts r ON l.entity = 'receipt' AND r.id = l.entity_id
       LEFT JOIN areas receipt_area ON receipt_area.id = r.area_id
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
