import { z } from 'zod';
import { idInputSchema } from '@shared/categories';
import {
  areaPaymentsQuerySchema,
  areaReceiptsQuerySchema,
  paymentCreateSchema,
  paymentPreviewSchema,
  paymentUpdateSchema,
} from '@shared/payments';
import type { Repositories } from '../db/repositories';
import { businessToday } from '../services/clock';
import { handle } from './handle';

export function registerPaymentIpc({ payments }: Repositories): void {
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
  // The computer date looks wrong when money was received "after" today.
  handle('clock:check', z.undefined(), () => {
    const latest = payments.latestPaidOn();
    return { looksWrong: latest !== null && latest > businessToday().date };
  });
}
