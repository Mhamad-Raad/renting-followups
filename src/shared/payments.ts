import { z } from 'zod';
import type { Currency } from './currency';
import {
  dateStringSchema,
  monthSchema,
  yearMonthSchema,
  yearSchema,
  type DateString,
  type YearMonth,
} from './dates';
import { toDigitStyle, type DigitStyle } from './digits';

export const PAYMENT_NOTE_MAX = 500;
/** Far above any real payment, and still exact as a JavaScript number. */
export const MAX_PAYMENT = 1_000_000_000_000_000;
/** How far past the current month a payment may reach (ARCHITECTURE.md section 7.1). */
export const HORIZON_MONTHS = 24;

const id = z.number().int().positive();
const amount = z.number().int().positive().max(MAX_PAYMENT);

/** What the payment form sends: the amount and the month it starts filling from. */
export const paymentPreviewSchema = z
  .object({
    areaId: id,
    amount,
    from: yearMonthSchema,
    /** When editing, the receipt being changed: its own months count as open again. */
    receiptId: id.nullable(),
  })
  .strict();
export type PaymentPreviewQuery = z.infer<typeof paymentPreviewSchema>;

const details = {
  amount,
  from: yearMonthSchema,
  paidOn: dateStringSchema,
  note: z.string().trim().max(PAYMENT_NOTE_MAX),
};

/** A new payment. A past record (backfill) gets no receipt number. */
export const paymentCreateSchema = z
  .object({ areaId: id, isBackfill: z.boolean(), ...details })
  .strict();
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;

/** Every detail of a receipt can be corrected; the months are worked out again. */
export const paymentUpdateSchema = z.object({ id, ...details }).strict();
export type PaymentUpdate = z.infer<typeof paymentUpdateSchema>;

export const areaPaymentsQuerySchema = z.object({ areaId: id }).strict();
export type AreaPaymentsQuery = z.infer<typeof areaPaymentsQuerySchema>;

/** The receipts that paid any month of a year, or of one month of it. */
export const areaReceiptsQuerySchema = z
  .object({ areaId: id, year: yearSchema, month: monthSchema.nullable() })
  .strict();
export type AreaReceiptsQuery = z.infer<typeof areaReceiptsQuerySchema>;

/** The part of a payment that goes to one month. */
export interface Allocation extends YearMonth {
  amount: number;
}

/** A month a payment will fill, with what the form needs to say "full" or "50,000 of 250,000". */
export interface PlannedMonth extends Allocation {
  /** The month's rent. */
  expected: number;
  /** Already paid towards it by other receipts. */
  paidBefore: number;
}

export type AllocationResult =
  | { ok: true; months: PlannedMonth[] }
  /** More than everything owed up to the horizon: almost certainly a typing mistake. */
  | { ok: false; reason: 'too_much' }
  /** No month from the chosen one up to the horizon has rent to fill (vacant, or too far ahead). */
  | { ok: false; reason: 'nothing_open' };

export interface Receipt {
  id: number;
  /** Null for a past record. */
  receiptNumber: number | null;
  isBackfill: boolean;
  renterName: string | null;
  currency: Currency;
  totalAmount: number;
  paidOn: DateString;
  note: string;
  voided: boolean;
  /** Oldest month first. */
  allocations: Allocation[];
}

type Problem = 'not_found' | 'too_much' | 'nothing_open' | 'future_date';

export type PaymentCreateResult =
  { ok: true; id: number; receiptNumber: number | null } | { ok: false; reason: Problem };

export type PaymentUpdateResult = { ok: true } | { ok: false; reason: Problem | 'cancelled' };

export type PaymentVoidResult = { ok: true } | { ok: false; reason: 'not_found' | 'cancelled' };

/** A receipt number as printed and shown: at least four digits, for example 0042. */
export function formatReceiptNumber(receiptNumber: number, style: DigitStyle): string {
  return toDigitStyle(String(receiptNumber).padStart(4, '0'), style);
}
