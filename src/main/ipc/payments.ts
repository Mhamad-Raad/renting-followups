import { z } from 'zod';
import { idInputSchema } from '@shared/categories';
import type { DateString } from '@shared/dates';
import {
  areaMonthSchema,
  areaPaymentsQuerySchema,
  areaReceiptsQuerySchema,
  paymentCreateSchema,
  paymentPreviewSchema,
  paymentUpdateSchema,
} from '@shared/payments';
import type { Repositories } from '../db/repositories';
import { businessToday } from '../services/clock';
import { handle } from './handle';

export function registerPaymentIpc({
  backupSettings,
  monthPayments,
  paid,
  payments,
}: Repositories): void {
  handle('payments:forArea', areaReceiptsQuerySchema, (query) => payments.forArea(query));
  handle('payments:suggestedStart', areaPaymentsQuerySchema, ({ areaId }) =>
    payments.suggestedStart(areaId, businessToday().month),
  );
  handle(
    'payments:preview',
    paymentPreviewSchema,
    ({ areaId, monthCount, from, receiptId, isBackfill }) =>
      payments.preview(areaId, monthCount, from, businessToday().month, receiptId, isBackfill),
  );
  handle('payments:create', paymentCreateSchema, (input) =>
    payments.create(input, businessToday()),
  );
  handle('payments:update', paymentUpdateSchema, (input) =>
    payments.update(input, businessToday()),
  );
  handle('payments:void', idInputSchema, ({ id }) => payments.void(id));
  // Clicking a paid month box (ARCHITECTURE.md section 7.4): first what would change, then the change.
  handle('payments:monthTakeOutPreview', areaMonthSchema, (query) =>
    monthPayments.takeOutPreview(query),
  );
  handle('payments:monthTakeOut', areaMonthSchema, (query) => monthPayments.takeOut(query));
  // The computer date looks wrong when money was received, or a backup made, "after" today.
  // The latest such date is named, so the owner can find it once the clock is right again.
  handle('clock:check', z.undefined(), () => {
    const today = businessToday().date;
    const dated = [
      { date: paid.latestPaidOn(), kind: 'payment' as const },
      { date: backupSettings.lastBackupOn(), kind: 'backup' as const },
    ].filter(
      (item): item is { date: DateString; kind: 'payment' | 'backup' } =>
        item.date !== null && item.date > today,
    );
    const latest = dated.sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    return { future: latest ?? null };
  });
}
