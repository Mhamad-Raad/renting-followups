import type { Currency } from './currency';
import type { YearMonth } from './dates';

/**
 * Importing areas from an Excel or CSV file (ARCHITECTURE.md section 16).
 * The columns of the template, in order; the file's header row may name them
 * in any of the app's languages.
 */
export const IMPORT_COLUMNS = [
  'name',
  'category',
  'currency',
  'monthlyPrice',
  'startMonth',
  'startYear',
  'renterName',
  'renterPhone',
  'address',
  'notes',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Columns a file must have; the others may be left out. */
export const REQUIRED_COLUMNS: readonly ImportColumn[] = [
  'name',
  'category',
  'currency',
  'monthlyPrice',
  'startMonth',
  'startYear',
];

/** The most rows one file may hold: far more than the owner's areas. */
export const IMPORT_MAX_ROWS = 5000;
/** The largest file accepted, in bytes. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;

/** One area ready to be created. */
export interface ImportRow {
  /** The row number in the file, as the owner sees it in Excel. */
  row: number;
  name: string;
  category: string;
  currency: Currency;
  /** In minor units (whole dinars, or cents). */
  monthlyPrice: number;
  rentStartsFrom: YearMonth;
  renter: { fullName: string; phone: string } | null;
  address: string;
  notes: string;
}

/** What is wrong with a row, shown as "Row 12: …". */
export type RowProblem =
  | { kind: 'missing'; column: ImportColumn }
  | { kind: 'too_long'; column: ImportColumn; max: number }
  | { kind: 'bad_currency' }
  | { kind: 'bad_price'; currency: Currency | null }
  | { kind: 'bad_month' }
  | { kind: 'bad_year'; min: number; max: number }
  | { kind: 'bad_phone' }
  | { kind: 'phone_without_renter' }
  | { kind: 'same_as_row'; otherRow: number }
  | { kind: 'already_exists' };

export interface ImportProblem {
  row: number;
  problems: RowProblem[];
}

export interface ImportPreview {
  fileName: string;
  /** Rows that will be imported. */
  rows: ImportRow[];
  /** Rows that will be skipped, and why. */
  problems: ImportProblem[];
  /** Categories that do not exist yet and will be created. */
  newCategories: string[];
}

/** Why a whole file cannot be used. */
export type ImportFileProblem =
  | { reason: 'not_readable' }
  | { reason: 'too_large' }
  | { reason: 'empty' }
  | { reason: 'too_many_rows'; max: number }
  | { reason: 'missing_columns'; columns: ImportColumn[] };

export type ImportChoice =
  | { ok: true; done: 'cancelled' }
  | { ok: true; done: 'checked'; preview: ImportPreview }
  | ({ ok: false } & ImportFileProblem);

export type ImportResult =
  | { ok: true; areas: number; categories: number }
  /** Nothing checked to import, or the data changed since the check (choose the file again). */
  | { ok: false; reason: 'nothing_checked' | 'changed' };

export type TemplateResult = { ok: true; done: 'saved' | 'cancelled' } | { ok: false };
