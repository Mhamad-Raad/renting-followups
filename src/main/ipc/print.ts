import { idInputSchema } from '@shared/categories';
import { formatReceiptNumber } from '@shared/payments';
import {
  exportReportSchema,
  PRINT_ROUTES,
  printReadySchema,
  printReceiptSchema,
  printReportSchema,
  type PrintOutput,
  type PrintResult,
} from '@shared/printing';
import type { Repositories } from '../db/repositories';
import { businessToday, currentYearMonth } from '../services/clock';
import { buildReportWorkbook } from '../services/excel';
import {
  askWhereToSave,
  isPrinting,
  printPageReady,
  renderPdf,
  saveFile,
  sendToPrinter,
  withHiddenPage,
} from '../services/pdf';
import { translate } from '../services/translate';
import { handle } from './handle';

export function registerPrintIpc({ categories, payments, reports, settings }: Repositories): void {
  const t = (key: string, values?: Record<string, string>) =>
    translate(settings.getAll().language, key, values);

  /** Prints a print page, or saves it as a PDF where the owner chooses. */
  const printOrSave = async (
    route: string,
    output: PrintOutput,
    landscape: boolean,
    fileName: string,
  ): Promise<PrintResult> => {
    if (isPrinting()) return { ok: false, reason: 'busy' };
    let path: string | null = null;
    if (output === 'pdf') {
      path = await askWhereToSave(fileName, { name: t('print.pdfFiles'), extension: 'pdf' });
      if (!path) return { ok: true, done: 'cancelled' };
    }
    const job = await withHiddenPage<Buffer | 'printed' | 'cancelled'>(route, (contents) =>
      path ? renderPdf(contents) : sendToPrinter(contents, landscape),
    );
    if (!job.ok) return job;
    if (typeof job.value === 'string') return { ok: true, done: job.value };
    if (!path || !(await saveFile(path, job.value))) return { ok: false, reason: 'save_failed' };
    return { ok: true, done: 'saved' };
  };

  const reportFileName = (year: number) => t('print.fileReport', { year: String(year) });

  handle('print:ready', printReadySchema, ({ ok }, sender) => {
    printPageReady(sender.webContentsId, ok);
    return null;
  });

  handle('print:receiptData', idInputSchema, ({ id }) => {
    const data = payments.printData(id, businessToday().date);
    return typeof data === 'object' ? data : null;
  });

  handle('print:receipt', printReceiptSchema, async ({ id, output }) => {
    const data = payments.printData(id, businessToday().date);
    if (data === null) return { ok: false, reason: 'not_found' };
    if (data === 'past_record') return { ok: false, reason: 'past_record' };
    const number = formatReceiptNumber(data.receipt.receiptNumber ?? 0, 'western');
    const result = await printOrSave(
      PRINT_ROUTES.receipt(id),
      output,
      false,
      t('print.fileReceipt', { number }),
    );
    // Only a finished print counts, so the next one is stamped "Copy".
    if (result.ok && result.done !== 'cancelled') payments.markPrinted(id);
    return result;
  });

  handle('print:report', printReportSchema, ({ query, output }) =>
    printOrSave(PRINT_ROUTES.report(query), output, true, reportFileName(query.year)),
  );

  handle('export:reportExcel', exportReportSchema, async ({ query }): Promise<PrintResult> => {
    const path = await askWhereToSave(reportFileName(query.year), {
      name: t('print.excelFiles'),
      extension: 'xlsx',
    });
    if (!path) return { ok: true, done: 'cancelled' };
    const { language, digitStyle, printTitle } = settings.getAll();
    const categoryName =
      query.categoryId === null
        ? null
        : (categories.list().find((category) => category.id === query.categoryId)?.name ?? null);
    const workbook = buildReportWorkbook(
      reports.build(query, currentYearMonth(), language),
      query,
      {
        language,
        digitStyle,
        categoryName,
        printedOn: businessToday().date,
        printTitle,
      },
    );
    const saved = await saveFile(path, new Uint8Array(await workbook.xlsx.writeBuffer()));
    return saved ? { ok: true, done: 'saved' } : { ok: false, reason: 'save_failed' };
  });
}
