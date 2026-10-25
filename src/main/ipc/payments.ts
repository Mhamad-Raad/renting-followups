import { z } from 'zod';
import { idInputSchema } from '@shared/categories';
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
  handle('payments:preview', paymentPreviewSchema, ({ areaId, amount, from, receiptId }) =>
    payments.preview(areaId, amount, from, businessToday().month, receiptId),
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
  handle('clock:check', z.undefined(), () => {
    const today = businessToday().date;
    const latest = [paid.latestPaidOn(), backupSettings.lastBackupOn()];
    return { looksWrong: latest.some((date) => date !== null && date > today) };
  });
}
