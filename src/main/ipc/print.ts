import { areaLabel } from '@shared/areas';
import {
  exportReportSchema,
  PRINT_ROUTES,
  printReadySchema,
  printReportSchema,
  type PrintOutput,
  type PrintResult,
} from '@shared/printing';
import type { ReportQuery } from '@shared/reports';
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

export function registerPrintIpc({ areas, categories, reports, settings }: Repositories): void {
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

  /** The one place a report is limited to (the area page), named in its title and file name. */
  const onlyAreaName = ({ onlyIds }: ReportQuery): string | null => {
    const area = onlyIds?.length === 1 && onlyIds[0] !== undefined ? areas.get(onlyIds[0]) : null;
    return area ? areaLabel({ name: area.name, categoryName: area.category.name }) : null;
  };
  const reportFileName = (query: ReportQuery) => {
    const name = onlyAreaName(query);
    const year = String(query.year);
    return name ? t('print.fileAreaReport', { name, year }) : t('print.fileReport', { year });
  };

  handle('print:ready', printReadySchema, ({ ok }, sender) => {
    printPageReady(sender.webContentsId, ok);
    return null;
  });

  handle('print:report', printReportSchema, ({ query, output }) =>
    printOrSave(PRINT_ROUTES.report(query), output, true, reportFileName(query)),
  );

  handle('export:reportExcel', exportReportSchema, async ({ query }): Promise<PrintResult> => {
    const path = await askWhereToSave(reportFileName(query), {
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
        areaName: onlyAreaName(query),
      },
    );
    const saved = await saveFile(path, new Uint8Array(await workbook.xlsx.writeBuffer()));
    return saved ? { ok: true, done: 'saved' } : { ok: false, reason: 'save_failed' };
  });
}
