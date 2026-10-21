import type { Db } from '../connection';
import { createAllocationRepository } from './allocations';
import { createAreaRepository } from './areas';
import { createAreaViewRepository } from './areaViews';
import { createAuditRepository } from './audit';
import { createCategoryRepository } from './categories';
import { createPaidRepository } from './paid';
import { createPaymentRepository } from './payments';
import { createPriceChangeRepository } from './priceChanges';
import { createPriceRepository } from './prices';
import { createReportRepository } from './reports';
import { createRenterRepository } from './renters';
import { createCredentialsRepository, createSettingsRepository } from './settings';

/** Every repository, created once with its prepared statements. */
export function createRepositories(db: Db) {
  const audit = createAuditRepository(db);
  const categories = createCategoryRepository(db, audit);
  const prices = createPriceRepository(db);
  const renters = createRenterRepository(db);
  const paid = createPaidRepository(db);
  const allocations = createAllocationRepository(db);
  const payments = createPaymentRepository(db, { allocations, audit, paid, prices, renters });
  const areas = createAreaRepository(db, { audit, categories, prices, renters });
  return {
    settings: createSettingsRepository(db),
    credentials: createCredentialsRepository(db),
    categories,
    areas,
    areaViews: createAreaViewRepository(db, { areas, paid, prices }),
    priceChanges: createPriceChangeRepository(db, { allocations, areas, audit, prices }),
    paid,
    payments,
    reports: createReportRepository(db, { paid, prices }),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
