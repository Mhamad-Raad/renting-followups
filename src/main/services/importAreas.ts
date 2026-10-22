import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import {
  ADDRESS_MAX,
  AREA_NAME_MAX,
  areaCreateSchema,
  MAX_MONTHLY_PRICE,
  NOTES_MAX,
  PERSON_NAME_MAX,
  PHONE_MAX,
  PHONE_PATTERN,
} from '@shared/areas';
import { CATEGORY_NAME_MAX } from '@shared/categories';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { MIN_YEAR, toDateString } from '@shared/dates';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  REQUIRED_COLUMNS,
  type ImportChoice,
  type ImportColumn,
  type ImportPreview,
  type ImportProblem,
  type ImportResult,
  type ImportRow,
  type RowProblem,
} from '@shared/import';
import { toWesternDigits } from '@shared/digits';
import { normalizeText } from '@shared/normalizeText';
import { parseAmount, parseInteger } from '@shared/parseNumber';
import { LANGUAGES, type Language } from '@shared/settings';
import type { Db } from '../db/connection';
import type { Repositories } from '../db/repositories';
import { translate } from './translate';

/**
 * Importing areas from Excel or CSV (ARCHITECTURE.md section 16). The file is
 * read into plain text cells, every row is checked, and the owner sees a
 * preview: the areas that will be created, the rows that will be skipped and
 * why, and the categories that will be created. Nothing is saved until the
 * owner confirms, and then everything is saved together or nothing is.
 */

/** A row of the file as text, with its row number as Excel shows it. */
export interface TableRow {
  row: number;
  cells: string[];
}

const TEXT_LIMITS: Partial<Record<ImportColumn, number>> = {
  name: AREA_NAME_MAX,
  category: CATEGORY_NAME_MAX,
  renterName: PERSON_NAME_MAX,
  renterPhone: PHONE_MAX,
  address: ADDRESS_MAX,
  notes: NOTES_MAX,
};

/** Ways people write the two currencies, compared after `comparable`. */
const CURRENCY_WORDS: Record<Currency, string[]> = {
  IQD: ['iqd', 'دینار', 'دیناری عێراقی', 'دینار عراقی', 'دع', 'dinar', 'id'],
  USD: ['usd', 'دۆلار', 'دولار', 'دۆلاری ئەمریکی', 'دولار امریکی', '$', 'dollar', 'us$'],
};

/** Text compared without case, spaces, dots or letter variants. */
function comparable(text: string): string {
  return normalizeText(text).replace(/[\s.\-_:()/]/g, '');
}

const CURRENCY_LOOKUP = new Map(
  (Object.keys(CURRENCY_WORDS) as Currency[]).flatMap((currency) =>
    CURRENCY_WORDS[currency].map((word) => [comparable(word), currency] as const),
  ),
);

/** A header cell's text in every language, for recognising the columns of any template. */
function headerLookup(): Map<string, ImportColumn> {
  const lookup = new Map<string, ImportColumn>();
  for (const column of IMPORT_COLUMNS) {
    for (const language of LANGUAGES) {
      lookup.set(comparable(translate(language, `import.columns.${column}`)), column);
    }
  }
  return lookup;
}

/** Writes a number as Excel showed it, without floating-point noise (0.1 + 0.2 is "0.3"). */
function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
}

/** A cell as plain text, whatever Excel stored in it. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value)
    return value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  if ('formula' in value || 'sharedFormula' in value) {
    const { result } = value as { result?: ExcelJS.CellValue };
    return result === undefined ||
      (typeof result === 'object' && result !== null && 'error' in result)
      ? ''
      : cellText(result);
  }
  if ('text' in value) return String(value.text).trim();
  return '';
}

/**
 * The separator of a CSV file, from its first line: Excel writes `;` instead
 * of `,` on computers set to many languages (Arabic among them).
 */
function csvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (separator: string) => firstLine.split(separator).length;
  return [';', '\t'].reduce(
    (best, separator) => (count(separator) > count(best) ? separator : best),
    ',',
  );
}

/** Rows read from a CSV file before stopping: the header, the most rows allowed, and one more. */
const READ_LIMIT = IMPORT_MAX_ROWS + 2;
/**
 * The most an Excel file may unpack to. A real file of the most rows allowed
 * is a few megabytes; a small file packed to unpack to far more would fill
 * the memory and freeze the app.
 */
const XLSX_MAX_UNPACKED_BYTES = 50 * 1024 * 1024;

/** A row's cells as text; null for an empty row. */
function rowCells(
  values: ExcelJS.CellValue[] | Record<string, ExcelJS.CellValue>,
): string[] | null {
  const cells = Array.isArray(values) ? values.slice(1).map((value) => cellText(value)) : [];
  return cells.some((cell) => cell !== '') ? cells : null;
}

/**
 * How many bytes a zip file (an .xlsx is one) says its files unpack to, from
 * its table of contents at the end; null when that table cannot be read.
 */
export function unpackedSize(zip: Buffer): number | null {
  const END_SIGNATURE = 0x06054b50;
  const ENTRY_SIGNATURE = 0x02014b50;
  // The end record is 22 bytes, followed by a comment of up to 65535 bytes.
  const searchFrom = Math.max(0, zip.length - 22 - 0xffff);
  let end = -1;
  for (let at = zip.length - 22; at >= searchFrom; at -= 1) {
    if (zip.readUInt32LE(at) === END_SIGNATURE) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  const entries = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (at + 46 > zip.length || zip.readUInt32LE(at) !== ENTRY_SIGNATURE) return null;
    const size = zip.readUInt32LE(at + 24);
    // 0xFFFFFFFF means a size too big for this field (zip64): far over any limit here.
    if (size === 0xffffffff) return Number.POSITIVE_INFINITY;
    total += size;
    at += 46 + zip.readUInt16LE(at + 28) + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return total;
}

/** Reads the first sheet of an Excel file, after checking it does not unpack to too much. */
async function readXlsx(file: string): Promise<TableRow[] | 'too_large' | null> {
  const zip = readFileSync(file);
  const size = unpackedSize(zip);
  if (size === null) return null;
  if (size > XLSX_MAX_UNPACKED_BYTES) return 'too_large';
  const sheet = (
    await new ExcelJS.Workbook().xlsx.load(
      zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength),
    )
  ).worksheets[0];
  const rows: TableRow[] = [];
  sheet?.eachRow({ includeEmpty: false }, (row, number) => {
    const cells = rowCells(row.values);
    if (cells) rows.push({ row: number, cells });
  });
  return rows;
}

/** Reads a CSV file; every value stays text, so a phone's leading 0 is kept. */
async function readCsv(file: string): Promise<TableRow[] | null> {
  let text: string;
  try {
    // Only UTF-8 (Excel's "CSV UTF-8"); another encoding would read as garbage.
    text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  } catch {
    return null;
  }
  const sheet = await new ExcelJS.Workbook().csv.read(Readable.from([text]), {
    map: (value: unknown) => value,
    parserOptions: { delimiter: csvDelimiter(text), maxRows: READ_LIMIT },
  });
  const rows: TableRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    const cells = rowCells(row.values);
    if (cells) rows.push({ row: number, cells });
  });
  return rows;
}

/** Reads the first sheet of an Excel (.xlsx) or CSV file as text rows; null when it cannot be read. */
export async function readTable(file: string): Promise<TableRow[] | 'too_large' | null> {
  try {
    if (statSync(file).size > IMPORT_MAX_BYTES) return 'too_large';
    return extname(file).toLowerCase() === '.csv' ? await readCsv(file) : await readXlsx(file);
  } catch {
    return null;
  }
}

/** What the check needs to know about the data already in the app. */
export interface ImportContext {
  /** True when an area of this name is already in this category (names as typed). */
  areaExists: (category: string, name: string) => boolean;
  /** True when a category of this name already exists. */
  categoryExists: (category: string) => boolean;
  currentYear: number;
}

/** Rows of the template where Excel checks currency and month as they are typed. */
const TEMPLATE_ROWS = 1000;

const isBlank = (row: TableRow) => row.cells.every((cell) => cell === '');

/**
 * An Iraqi mobile number is 07 and nine digits. Excel drops the leading 0 of
 * a phone typed into a number cell (7501234567), so it is put back.
 */
function withLeadingZero(phone: string): string {
  if (!/^7\d{9}$/.test(toWesternDigits(phone))) return phone;
  // The 0 in the same digits as the number: ٠ before ٧, ۰ before ۷.
  const zero = String.fromCharCode((phone.codePointAt(0) ?? 0x37) - 7);
  return `${zero}${phone}`;
}

/** Checks one row; returns the area to create, or what is wrong with the row. */
function checkRow(
  value: (column: ImportColumn) => string,
  currentYear: number,
): { area: Omit<ImportRow, 'row'> } | { problems: RowProblem[] } {
  const problems: RowProblem[] = [];
  for (const column of IMPORT_COLUMNS) {
    const max = TEXT_LIMITS[column];
    if (max !== undefined && value(column).length > max) {
      problems.push({ kind: 'too_long', column, max });
    }
  }
  for (const column of ['name', 'category', 'currency', 'monthlyPrice'] as const) {
    if (value(column) === '') problems.push({ kind: 'missing', column });
  }

  const currency =
    value('currency') === '' ? null : (CURRENCY_LOOKUP.get(comparable(value('currency'))) ?? null);
  if (value('currency') !== '' && currency === null) problems.push({ kind: 'bad_currency' });

  let monthlyPrice: number | null = null;
  if (value('monthlyPrice') !== '') {
    const parsed = parseAmount(value('monthlyPrice'), FRACTION_DIGITS[currency ?? 'USD']);
    // The same upper limit as the area form, so a checked row can always be saved.
    if (parsed.ok && parsed.value <= MAX_MONTHLY_PRICE) monthlyPrice = parsed.value;
    else problems.push({ kind: 'bad_price', currency });
  }

  const month = parseInteger(value('startMonth'));
  if (value('startMonth') === '') problems.push({ kind: 'missing', column: 'startMonth' });
  else if (!month.ok || month.value < 1 || month.value > 12) problems.push({ kind: 'bad_month' });

  const lastYear = currentYear + 2;
  const year = parseInteger(value('startYear'));
  if (value('startYear') === '') problems.push({ kind: 'missing', column: 'startYear' });
  else if (!year.ok || year.value < MIN_YEAR || year.value > lastYear) {
    problems.push({ kind: 'bad_year', min: MIN_YEAR, max: lastYear });
  }

  const renterName = value('renterName');
  const phone = withLeadingZero(value('renterPhone'));
  if (phone !== '' && !PHONE_PATTERN.test(phone)) problems.push({ kind: 'bad_phone' });
  if (phone !== '' && renterName === '') problems.push({ kind: 'phone_without_renter' });

  if (problems.length > 0 || currency === null || monthlyPrice === null) {
    return { problems };
  }
  return {
    area: {
      name: value('name'),
      category: value('category'),
      currency,
      monthlyPrice,
      rentStartsFrom: { year: year.ok ? year.value : 0, month: month.ok ? month.value : 0 },
      renter: renterName === '' ? null : { fullName: renterName, phone },
      address: value('address'),
      notes: value('notes'),
    },
  };
}

/**
 * Checks a file's rows: finds the columns from the header row (the first row
 * with text), then checks every row after it. Empty rows are ignored.
 */
export function checkTable(
  table: TableRow[],
  fileName: string,
  context: ImportContext,
): Exclude<ImportChoice, { done: 'cancelled' }> {
  const rows = table.filter((row) => !isBlank(row));
  const [header, ...body] = rows;
  if (!header || body.length === 0) return { ok: false, reason: 'empty' };
  if (body.length > IMPORT_MAX_ROWS) {
    return { ok: false, reason: 'too_many_rows', max: IMPORT_MAX_ROWS };
  }

  const lookup = headerLookup();
  const position = new Map<ImportColumn, number>();
  header.cells.forEach((cell, index) => {
    const column = lookup.get(comparable(cell));
    if (column && !position.has(column)) position.set(column, index);
  });
  const missing = REQUIRED_COLUMNS.filter((column) => !position.has(column));
  if (missing.length > 0) return { ok: false, reason: 'missing_columns', columns: missing };

  const preview: ImportPreview = { fileName, rows: [], problems: [], newCategories: [] };
  const firstRowOf = new Map<string, number>();
  const newCategories = new Map<string, string>();
  for (const row of body) {
    const value = (column: ImportColumn) => {
      const index = position.get(column);
      return index === undefined ? '' : (row.cells[index] ?? '').trim();
    };
    const checked = checkRow(value, context.currentYear);
    const key = `${normalizeText(value('category'))}\u0000${normalizeText(value('name'))}`;
    const problems = 'problems' in checked ? [...checked.problems] : [];
    const earlier = firstRowOf.get(key);
    if (value('name') !== '' && value('category') !== '') {
      if (earlier !== undefined) problems.push({ kind: 'same_as_row', otherRow: earlier });
      else if (context.areaExists(value('category'), value('name'))) {
        problems.push({ kind: 'already_exists' });
      }
      if (earlier === undefined) firstRowOf.set(key, row.row);
    }
    if (problems.length > 0 || !('area' in checked)) {
      preview.problems.push({ row: row.row, problems } satisfies ImportProblem);
      continue;
    }
    preview.rows.push({ row: row.row, ...checked.area });
    const category = normalizeText(checked.area.category);
    if (!context.categoryExists(checked.area.category) && !newCategories.has(category)) {
      newCategories.set(category, checked.area.category);
    }
  }
  preview.newCategories = [...newCategories.values()];
  return { ok: true, done: 'checked', preview };
}

/** The current categories and areas, for checking a file against them. */
export function importContext(repos: Repositories, currentYear: number): ImportContext {
  const categories = new Map(
    repos.categories.list().map((category) => [normalizeText(category.name), category.id]),
  );
  return {
    categoryExists: (category) => categories.has(normalizeText(category)),
    areaExists: (category, name) => {
      const id = categories.get(normalizeText(category));
      return id !== undefined && repos.areas.nameTaken(id, name);
    },
    currentYear,
  };
}

/** Thrown inside the import to undo everything saved so far. */
class ImportChangedError extends Error {}

/**
 * Creates every checked area, and the categories they need, in one
 * transaction: if any area can no longer be created (for example one of the
 * same name was added meanwhile), nothing is saved.
 */
export function importAreas(db: Db, repos: Repositories, rows: ImportRow[]): ImportResult {
  try {
    return db.transaction((): ImportResult => {
      const categoryIds = new Map(
        repos.categories.list().map((category) => [normalizeText(category.name), category.id]),
      );
      let createdCategories = 0;
      for (const row of rows) {
        const key = normalizeText(row.category);
        let categoryId = categoryIds.get(key);
        if (categoryId === undefined) {
          const created = repos.categories.create({ name: row.category, color: null });
          if (!created.ok) throw new ImportChangedError();
          categoryId = created.id;
          categoryIds.set(key, categoryId);
          createdCategories += 1;
        }
        const input = areaCreateSchema.safeParse({
          categoryId,
          name: row.name,
          currency: row.currency,
          monthlyPrice: row.monthlyPrice,
          rentStartsFrom: row.rentStartsFrom,
          // The renter is taken to have started with the rent.
          renter: row.renter && {
            ...row.renter,
            startedOn: toDateString(row.rentStartsFrom.year, row.rentStartsFrom.month, 1),
          },
          address: row.address,
          contractStart: null,
          notes: row.notes,
        });
        if (!input.success || !repos.areas.create(input.data).ok) throw new ImportChangedError();
      }
      return { ok: true, areas: rows.length, categories: createdCategories };
    })();
  } catch (error) {
    if (error instanceof ImportChangedError) return { ok: false, reason: 'changed' };
    throw error;
  }
}

/**
 * The template to fill in: the columns in the chosen language (with an
 * example row explained on a second sheet, so it is never imported by
 * mistake), currency and month checked by Excel as they are typed, and the
 * phone column kept as text so a leading 0 is not lost.
 */
export function buildImportTemplate(language: Language, currentYear: number): ExcelJS.Workbook {
  const t = (key: string, values?: Record<string, string>) => translate(language, key, values);
  const rtl = language !== 'en';
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t('import.template.sheet'), {
    views: [{ rightToLeft: rtl, state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = IMPORT_COLUMNS.map((column) => ({
    header: t(`import.columns.${column}`),
    key: column,
    width: column === 'notes' || column === 'address' ? 36 : 20,
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF4' } };
  sheet.getColumn('renterPhone').numFmt = '@';

  const rows = { first: 2, last: TEMPLATE_ROWS + 1 };
  const validate = (column: ImportColumn, rule: ExcelJS.DataValidation) => {
    const letter = sheet.getColumn(column).letter;
    for (let row = rows.first; row <= rows.last; row += 1) {
      sheet.getCell(`${letter}${row}`).dataValidation = rule;
    }
  };
  validate('currency', {
    type: 'list',
    allowBlank: true,
    formulae: ['"IQD,USD"'],
    showErrorMessage: true,
    error: t('import.problem.bad_currency'),
  });
  validate('startMonth', {
    type: 'whole',
    operator: 'between',
    allowBlank: true,
    formulae: [1, 12],
    showErrorMessage: true,
    error: t('import.problem.bad_month', { min: '1', max: '12' }),
  });

  const help = workbook.addWorksheet(t('import.template.helpSheet'), {
    views: [{ rightToLeft: rtl }],
  });
  help.getColumn(1).width = 100;
  const example = t('import.template.example', { year: String(currentYear) });
  for (const line of [
    t('import.template.help1'),
    t('import.template.help2'),
    t('import.template.help3'),
    t('import.template.help4'),
    '',
    example,
  ]) {
    help.addRow([line]);
  }
  help.getRow(1).font = { bold: true };
  return workbook;
}
