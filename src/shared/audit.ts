import { z } from 'zod';
import type { Currency } from './currency';
import type { YearMonth } from './dates';

/** What happened, for the activity log. Translated on screen; stored as these codes. */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'restore',
  'change_price',
  'change_renter',
  'end_renter',
  'void',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = ['category', 'area', 'receipt'] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/** How many activity log entries are loaded at a time; "Show older" loads the next ones. */
export const ACTIVITY_PAGE_SIZE = 100;

export const activityQuerySchema = z
  .object({ beforeId: z.number().int().positive().nullable() })
  .strict();
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

/** One line of the activity log, with what the screen needs to say it in plain words. */
export interface ActivityEntry {
  id: number;
  /** When it happened (UTC timestamp). */
  at: string;
  action: AuditAction;
  entity: AuditEntity;
  /** The area or category, by its current name (for a receipt: its area). */
  name: string | null;
  currency: Currency | null;
  /** The new amount or rent; for a change, `previousAmount` is the old one. */
  amount: number | null;
  previousAmount: number | null;
  /** The month a rent change starts from. */
  month: YearMonth | null;
  renter: string | null;
  /** Null for a past record. */
  receiptNumber: number | null;
}

export interface ActivityPage {
  /** Newest first. */
  entries: ActivityEntry[];
  hasMore: boolean;
}
