import { z } from 'zod';
import { CURRENCIES, type Currency } from './currency';
import {
  dateStringSchema,
  monthSchema,
  yearMonthSchema,
  yearSchema,
  type DateString,
  type YearMonth,
} from './dates';
import type { CategoryColor } from './categories';
import type { MonthBox, StatusChange, YearSummary } from './months';
import { normalizeText } from './normalizeText';
import { priceForMonth, type PriceRow } from './prices';

export const AREA_NAME_MAX = 120;
export const PERSON_NAME_MAX = 120;
export const PHONE_MAX = 30;
export const ADDRESS_MAX = 300;
export const NOTES_MAX = 5000;
export const SEARCH_MAX = 200;
/** The largest monthly rent accepted, in minor units: far above any real rent. */
export const MAX_MONTHLY_PRICE = 10_000_000_000_000;

const id = z.number().int().positive();
/**
 * The area name is optional: an area may be known only by its category and
 * renter. A name of only marks that search ignores (a lone tatweel or ZWNJ)
 * counts as no name, so it is never shown as an invisible label or taken for
 * a duplicate.
 */
export function cleanAreaName(name: string): string {
  const trimmed = name.trim();
  return normalizeText(trimmed) === '' ? '' : trimmed;
}
const areaName = z.string().trim().max(AREA_NAME_MAX).transform(cleanAreaName);
const monthlyPrice = z.number().int().min(0).max(MAX_MONTHLY_PRICE);
/** Digits of any style, spaces, +, - and brackets: how people write phone numbers. */
export const PHONE_PATTERN = /^[0-9\u0660-\u0669\u06F0-\u06F9+\-()\s]*$/;
const phone = z.string().trim().max(PHONE_MAX).regex(PHONE_PATTERN);
const renterDetails = z
  .object({ fullName: z.string().trim().min(1).max(PERSON_NAME_MAX), phone })
  .strict();

/** What an area's label needs: its own name, its category and its current renter's name. */
export interface AreaNaming {
  name: string;
  categoryName: string;
  renterName: string | null;
}

/**
 * What an area is called on screen and on paper: its own name, or, when it
 * has none, its category, as the owner's clients know a place by its group
 * and its renter (ARCHITECTURE.md section 5).
 */
export function areaLabel(area: Pick<AreaNaming, 'name' | 'categoryName'>): string {
  return area.name !== '' ? area.name : area.categoryName;
}

/**
 * The small line under an area's label where there is no renter column
 * beside it: the category under an own name, else the renter, so two places
 * of the same category can be told apart.
 */
export function areaSubline(area: AreaNaming): string | null {
  return area.name !== '' ? area.categoryName : area.renterName;
}

/** True when the area has its own name, so its category is worth showing under it. */
export function hasOwnName(area: Pick<AreaNaming, 'name'>): boolean {
  return area.name !== '';
}

/** Compares names in the reader's language, with numbers in number order: "Shop 2" before "Shop 10". */
export function nameCollator(language: string): Intl.Collator {
  return new Intl.Collator(language, { numeric: true });
}

/**
 * Orders areas by what they are called on screen, then by renter, so the
 * places of one category stand together in renter order; the same label and
 * renter keep the order the areas were added in, so every list, print and
 * export agrees.
 */
export function compareAreaLabels(
  collator: Intl.Collator,
): (a: AreaNaming & { id: number }, b: AreaNaming & { id: number }) => number {
  return (a, b) =>
    collator.compare(areaLabel(a), areaLabel(b)) ||
    collator.compare(a.renterName ?? '', b.renterName ?? '') ||
    a.id - b.id;
}

export const areaCreateSchema = z
  .object({
    categoryId: id,
    name: areaName,
    currency: z.enum(CURRENCIES),
    monthlyPrice,
    rentStartsFrom: yearMonthSchema,
    renter: renterDetails.extend({ startedOn: dateStringSchema }).strict().nullable(),
    address: z.string().trim().max(ADDRESS_MAX),
    contractStart: dateStringSchema.nullable(),
    notes: z.string().max(NOTES_MAX),
  })
  .strict();
export type AreaCreate = z.infer<typeof areaCreateSchema>;

/** Edits everything except the currency and the price history. `renter` corrects the current renter's details. */
export const areaUpdateSchema = z
  .object({
    id,
    categoryId: id,
    name: areaName,
    address: z.string().trim().max(ADDRESS_MAX),
    contractStart: dateStringSchema.nullable(),
    notes: z.string().max(NOTES_MAX),
    renter: renterDetails.optional(),
  })
  .strict();
export type AreaUpdate = z.infer<typeof areaUpdateSchema>;

/** A new price from a month onward; 0 marks the area vacant from that month. */
export const priceChangeSchema = z
  .object({ areaId: id, from: yearMonthSchema, monthlyPrice })
  .strict();
export type PriceChange = z.infer<typeof priceChangeSchema>;

export const renterChangeSchema = z.discriminatedUnion('kind', [
  renterDetails
    .extend({ kind: z.literal('new'), areaId: id, startedOn: dateStringSchema })
    .strict(),
  z.object({ kind: z.literal('left'), areaId: id, endedOn: dateStringSchema }).strict(),
]);
export type RenterChange = z.infer<typeof renterChangeSchema>;

export const areaListQuerySchema = z
  .object({ search: z.string().max(SEARCH_MAX), categoryId: id.nullable() })
  .strict();
export type AreaListQuery = z.infer<typeof areaListQuerySchema>;

export const areaYearQuerySchema = z
  .object({ id, year: yearSchema, month: monthSchema.nullable() })
  .strict();
export type AreaYearQuery = z.infer<typeof areaYearQuerySchema>;

export interface Renter {
  id: number;
  fullName: string;
  phone: string;
  startedOn: DateString;
  endedOn: DateString | null;
}

export interface AreaListItem {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  categoryColor: CategoryColor | null;
  currency: Currency;
  renterName: string | null;
  renterPhone: string | null;
  /** This month's price; 0 = vacant, null = rent has not started yet. */
  currentPrice: number | null;
  /** The 12 months of the current year. */
  months: MonthBox[];
  summary: YearSummary;
}

/** The renter with no end date, if anyone rents the area now. */
export function currentRenter(renters: readonly Renter[]): Renter | null {
  return renters.find((renter) => renter.endedOn === null) ?? null;
}

export interface AreaDetails {
  id: number;
  name: string;
  category: { id: number; name: string; color: CategoryColor | null };
  currency: Currency;
  address: string;
  contractStart: DateString | null;
  notes: string;
  /** Oldest first. The first row is when the rent started. */
  prices: PriceRow[];
  /** Newest first; the current renter (if any) has no end date. */
  renters: Renter[];
}

export interface DeletedItems {
  areas: ({ id: number; deletedAt: string } & AreaNaming)[];
  categories: { id: number; name: string; deletedAt: string }[];
}

export type AreaSaveResult =
  | { ok: true; id: number }
  | { ok: false; reason: 'duplicate_name' | 'not_found' | 'category_not_found' };

export type PriceChangeResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'before_rent_start' | 'no_room' };

/** What a price change would do to money already paid (see `areas:priceChangeImpact`). */
export type PriceChangeImpact =
  | { ok: true; changes: StatusChange[] }
  /** Money already paid would have no month to go to (for example vacant from then on). */
  | { ok: false; reason: 'no_room' };

export type RenterChangeResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'no_current_renter' | 'before_current_renter' };

export type RestoreResult = { ok: true } | { ok: false; reason: 'not_found' | 'duplicate_name' };

/** True when a month comes before the area's rent started, where no price change can go. */
export function isBeforeRentStart(prices: readonly PriceRow[], month: YearMonth): boolean {
  return priceForMonth(prices, month) === null;
}
