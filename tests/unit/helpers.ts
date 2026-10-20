import { createConnection, type Db } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { createRepositories } from '../../src/main/db/repositories';
import type { AreaCreate } from '@shared/areas';

/** A fresh in-memory database at the newest schema, with all repositories. */
export function createTestDatabase() {
  const db: Db = createConnection(':memory:');
  migrate(db, MIGRATIONS);
  return { db, repos: createRepositories(db) };
}

/** A valid new area; override only what a test cares about. */
export function areaInput(categoryId: number, overrides: Partial<AreaCreate> = {}): AreaCreate {
  return {
    categoryId,
    name: 'Shop 1',
    currency: 'IQD',
    monthlyPrice: 250_000,
    rentStartsFrom: { year: 2026, month: 1 },
    renter: { fullName: 'Karwan Ahmed', phone: '0750 123 4567', startedOn: '2026-01-01' },
    address: '',
    contractStart: null,
    notes: '',
    ...overrides,
  };
}
