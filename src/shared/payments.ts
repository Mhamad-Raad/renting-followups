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
/** How far past the current month a payment may reach (ARCHITECTURE.md section 7.1). */
export const HORIZON_MONTHS = 24;
/** Far above any real payment (fifty years of rent), only to refuse nonsense. */
export const MAX_MONTH_COUNT = 600;

const id = z.number().int().positive();
/** How many whole months a payment pays: a month is paid whole or not at all. */
const monthCount = z.number().int().positive().max(MAX_MONTH_COUNT);

/** What the payment form sends: how many months, and the month it starts from. */
export const paymentPreviewSchema = z
  .object({
    areaId: id,
    monthCount,
    from: yearMonthSchema,
    /** When editing, the receipt being changed: its own months count as open again. */
    receiptId: id.nullable(),
    /** A past record: history, so it may start before the current renter's first month. */
    isBackfill: z.boolean(),
  })
  .strict();
export type PaymentPreviewQuery = z.infer<typeof paymentPreviewSchema>;

const details = {
  monthCount,
  from: yearMonthSchema,
  paidOn: dateStringSchema,
  note: z.string().trim().max(PAYMENT_NOTE_MAX),
};

/** A new payment. A past record (backfill) gets no receipt number. */
export const paymentCreateSchema = z
  .object({
    areaId: id,
    isBackfill: z.boolean(),
    ...details,
    /**
     * One month box clicked (section 7.4): that month may be before the current
     * renter started, so an earlier renter's unpaid month can still be paid.
     * The payment form never sends it: it starts from the renter's first month.
     */
    monthBox: z.literal(true).optional(),
  })
  .strict();
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;

/** Every detail of a receipt can be corrected; its months (and amount) are worked out again. */
export const paymentUpdateSchema = z.object({ id, ...details }).strict();
export type PaymentUpdate = z.infer<typeof paymentUpdateSchema>;

export const areaPaymentsQuerySchema = z.object({ areaId: id }).strict();
export type AreaPaymentsQuery = z.infer<typeof areaPaymentsQuerySchema>;

/** The receipts that paid any month of a year, or of one month of it. */
export const areaReceiptsQuerySchema = z
  .object({ areaId: id, year: yearSchema, month: monthSchema.nullable() })
  .strict();
export type AreaReceiptsQuery = z.infer<typeof areaReceiptsQuerySchema>;

/** One month of one area: the month box that was clicked. */
export const areaMonthSchema = z
  .object({ areaId: id, year: yearSchema, month: monthSchema })
  .strict();
export type AreaMonth = z.infer<typeof areaMonthSchema>;

/** What taking a paid month out does to one receipt that paid it (ARCHITECTURE.md section 7.4). */
export interface MonthTakeOut {
  receiptId: number;
  /** Null for a past record. */
  receiptNumber: number | null;
  /** This month's share of the receipt. */
  amount: number;
  /** True when the receipt paid only this month, so it is cancelled. */
  cancels: boolean;
}

export type MonthTakeOutResult =
  { ok: true; changes: MonthTakeOut[] } | { ok: false; reason: 'not_found' | 'not_paid' };

/** The part of a payment that goes to one month. */
export interface Allocation extends YearMonth {
  amount: number;
}

/**
 * The months a payment pays, each with its whole rent. `open` is how many
 * months could be paid from the chosen month, up to the horizon.
 */
/**
 * The months from the chosen one up to the first month paid that the payment
 * skips, so the form can say why it starts later.
 */
export interface SkippedMonths {
  /** Already paid. */
  paid: YearMonth[];
  /** Without rent: the place stood empty, or the rent had not started. */
  noRent: YearMonth[];
}

export const NOTHING_SKIPPED: SkippedMonths = { paid: [], noRent: [] };

export type AllocationResult =
  | { ok: true; months: Allocation[]; open: number; skipped: SkippedMonths }
  /** More months than are open up to the horizon. */
  | { ok: false; reason: 'too_much'; open: number }
  /** No month from the chosen one up to the horizon has rent to fill (vacant, or too far ahead). */
  | { ok: false; reason: 'nothing_open' }
  /** The chosen month is before the current renter started: they pay no month before theirs. */
  | { ok: false; reason: 'before_renter' };

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

type Problem = 'not_found' | 'too_much' | 'nothing_open' | 'before_renter' | 'future_date';

export type PaymentCreateResult =
  { ok: true; id: number; receiptNumber: number | null } | { ok: false; reason: Problem };

export type PaymentUpdateResult = { ok: true } | { ok: false; reason: Problem | 'cancelled' };

export type PaymentVoidResult = { ok: true } | { ok: false; reason: 'not_found' | 'cancelled' };

/** A receipt number as printed and shown: at least four digits, for example 0042. */
export function formatReceiptNumber(receiptNumber: number, style: DigitStyle): string {
  return toDigitStyle(String(receiptNumber).padStart(4, '0'), style);
}
