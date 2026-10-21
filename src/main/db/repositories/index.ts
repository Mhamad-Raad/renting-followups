import type { Db } from '../connection';
import { createAreaRepository } from './areas';
import { createAuditRepository } from './audit';
import { createCategoryRepository } from './categories';
import { createPaidRepository } from './paid';
import { createPaymentRepository } from './payments';
import { createPriceRepository } from './prices';
import { createRenterRepository } from './renters';
import { createCredentialsRepository, createSettingsRepository } from './settings';

/** Every repository, created once with its prepared statements. */
export function createRepositories(db: Db) {
  const audit = createAuditRepository(db);
  const categories = createCategoryRepository(db, audit);
  const prices = createPriceRepository(db);
  const renters = createRenterRepository(db);
  const paid = createPaidRepository(db);
  const payments = createPaymentRepository(db, { audit, paid, prices, renters });
  return {
    settings: createSettingsRepository(db),
    credentials: createCredentialsRepository(db),
    categories,
    areas: createAreaRepository(db, { audit, categories, paid, prices, renters }),
    paid,
    payments,
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
