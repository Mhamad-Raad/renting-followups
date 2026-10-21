import type { YearMonth } from '@shared/dates';
import { sortPrices, type PriceRow } from '@shared/prices';
import type { Db } from '../connection';

interface PriceRecord {
  area_id: number;
  monthly_price: number;
  year: number;
  month: number;
}

const COLUMNS =
  'area_id, monthly_price, effective_from_year AS year, effective_from_month AS month';

function toPriceRow(row: PriceRecord): PriceRow {
  return { year: row.year, month: row.month, monthlyPrice: row.monthly_price };
}

export function createPriceRepository(db: Db) {
  const selectForArea = db.prepare<[number], PriceRecord>(
    `SELECT ${COLUMNS} FROM area_prices WHERE area_id = ?`,
  );
  const selectForActiveAreas = db.prepare<[], PriceRecord>(
    `SELECT ${COLUMNS} FROM area_prices
     WHERE area_id IN (SELECT id FROM areas WHERE deleted_at IS NULL)`,
  );
  // A second change for the same month replaces the first: one price per month.
  const upsert = db.prepare<[number, number, number, number]>(
    `INSERT INTO area_prices (area_id, monthly_price, effective_from_year, effective_from_month)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (area_id, effective_from_year, effective_from_month)
     DO UPDATE SET monthly_price = excluded.monthly_price`,
  );

  return {
    /** Oldest first. */
    forArea(areaId: number): PriceRow[] {
      return sortPrices(selectForArea.all(areaId).map(toPriceRow));
    },

    /** Every area in use with its price rows, oldest first, in one query (no query per area). */
    forActiveAreas(): Map<number, PriceRow[]> {
      const byArea = new Map<number, PriceRow[]>();
      for (const row of selectForActiveAreas.all()) {
        const rows = byArea.get(row.area_id) ?? [];
        rows.push(toPriceRow(row));
        byArea.set(row.area_id, rows);
      }
      // Callers take the first row as "rent starts from", so the order must never depend on the database.
      for (const [areaId, rows] of byArea) byArea.set(areaId, sortPrices(rows));
      return byArea;
    },

    set(areaId: number, from: YearMonth, monthlyPrice: number): void {
      upsert.run(areaId, monthlyPrice, from.year, from.month);
    },
  };
}

export type PriceRepository = ReturnType<typeof createPriceRepository>;
