import type { Renter } from '@shared/areas';
import type { DateString } from '@shared/dates';
import { normalizePhone, normalizeText } from '@shared/normalizeText';
import type { Db } from '../connection';

interface RenterRecord {
  id: number;
  full_name: string;
  phone: string;
  started_on: string;
  ended_on: string | null;
}

const COLUMNS = 'id, full_name, phone, started_on, ended_on';

function toRenter(row: RenterRecord): Renter {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    startedOn: row.started_on,
    endedOn: row.ended_on,
  };
}

export interface RenterDetails {
  fullName: string;
  phone: string;
}

export function createRenterRepository(db: Db) {
  const selectForArea = db.prepare<[number], RenterRecord>(
    `SELECT ${COLUMNS} FROM renters WHERE area_id = ? ORDER BY started_on DESC, id DESC`,
  );
  const selectCurrent = db.prepare<[number], RenterRecord>(
    `SELECT ${COLUMNS} FROM renters WHERE area_id = ? AND ended_on IS NULL`,
  );
  const insert = db.prepare<[number, string, string, string, string, string]>(
    `INSERT INTO renters (area_id, full_name, full_name_normalized, phone, phone_digits, started_on)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const updateDetails = db.prepare<[string, string, string, string, number]>(
    `UPDATE renters SET full_name = ?, full_name_normalized = ?, phone = ?, phone_digits = ?
     WHERE id = ?`,
  );
  const end = db.prepare<[string, number]>('UPDATE renters SET ended_on = ? WHERE id = ?');

  // The search copies are always written from here, so they can never drift from the real values.
  const searchable = ({ fullName, phone }: RenterDetails) =>
    [fullName, normalizeText(fullName), phone, normalizePhone(phone)] as const;

  return {
    /** Newest first. */
    forArea: (areaId: number): Renter[] => selectForArea.all(areaId).map(toRenter),

    current(areaId: number): Renter | null {
      const row = selectCurrent.get(areaId);
      return row ? toRenter(row) : null;
    },

    start(areaId: number, details: RenterDetails, startedOn: DateString): void {
      insert.run(areaId, ...searchable(details), startedOn);
    },

    /** Corrects a renter's name or phone (a typo), without starting a new renter. */
    correct(renterId: number, details: RenterDetails): void {
      updateDetails.run(...searchable(details), renterId);
    },

    end(renterId: number, endedOn: DateString): void {
      end.run(endedOn, renterId);
    },
  };
}

export type RenterRepository = ReturnType<typeof createRenterRepository>;
