import { z } from 'zod';
import type { DateString } from './dates';
import type { Receipt } from './payments';
import { reportQuerySchema, type ReportQuery } from './reports';

/** Print sends the page to a printer (the Windows print dialog); pdf saves it as a file. */
export const PRINT_OUTPUTS = ['printer', 'pdf'] as const;
export type PrintOutput = (typeof PRINT_OUTPUTS)[number];

const id = z.number().int().positive();
const output = z.enum(PRINT_OUTPUTS);

export const printReceiptSchema = z.object({ id, output }).strict();
export type PrintReceiptInput = z.infer<typeof printReceiptSchema>;

export const printReportSchema = z.object({ query: reportQuerySchema, output }).strict();
export type PrintReportInput = z.infer<typeof printReportSchema>;

export const exportReportSchema = z.object({ query: reportQuerySchema }).strict();
export type ExportReportInput = z.infer<typeof exportReportSchema>;

/** A print page says it has drawn everything (or could not). */
export const printReadySchema = z.object({ ok: z.boolean() }).strict();
export type PrintReady = z.infer<typeof printReadySchema>;

export type PrintResult =
  | { ok: true; done: 'printed' | 'saved' | 'cancelled' }
  /** `save_failed`: the PDF or Excel file could not be written (for example, it is open in Excel). */
  | { ok: false; reason: 'not_found' | 'past_record' | 'busy' | 'failed' | 'save_failed' };

/** Everything a receipt page shows. */
export interface ReceiptPrintData {
  receipt: Receipt;
  areaName: string;
  renterPhone: string | null;
  /** 0 for the first print (the original); any later print is stamped "Copy". */
  printCount: number;
  /** The day the page is printed, for reports and the footer. */
  printedOn: DateString;
}

/** The in-app addresses of the print pages, shared by the main process and the screen. */
export const PRINT_ROUTES = {
  receipt: (receiptId: number) => `/print/receipt/${receiptId}`,
  report: (query: ReportQuery) => `/print/report?q=${encodeURIComponent(JSON.stringify(query))}`,
} as const;
