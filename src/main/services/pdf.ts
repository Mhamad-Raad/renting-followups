import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, type WebContents } from 'electron';
import { safeFileName } from '@shared/fileNames';
import { hardenWindow } from '../security';
import { appWebPreferences, loadRenderer } from '../windows';
import { describeError, logger } from './logger';

/**
 * Printing and PDF (ARCHITECTURE.md section 14): the app's own print page is
 * opened in a hidden window, waits until it says it has drawn everything,
 * is sent to the printer or saved as PDF, and the window is always destroyed
 * afterwards, on every path. No temporary files are written.
 */

const READY_TIMEOUT_MS = 30_000;
// A4 at 96 dpi, so the hidden page lays out like the paper.
const A4_PORTRAIT = { width: 794, height: 1123 };

const waitingPages = new Map<number, (ok: boolean) => void>();
let busy = false;

/** Called when a print page reports that it is ready (or could not draw). */
export function printPageReady(webContentsId: number, ok: boolean): void {
  waitingPages.get(webContentsId)?.(ok);
}

/** True while a print page is open, so callers can say so before asking where to save. */
export function isPrinting(): boolean {
  return busy;
}

export type PageJob<T> = { ok: true; value: T } | { ok: false; reason: 'busy' | 'failed' };

/** Opens `route` in a hidden window, runs `use` once the page is ready, then destroys the window. */
export async function withHiddenPage<T>(
  route: string,
  use: (contents: WebContents) => Promise<T>,
): Promise<PageJob<T>> {
  // One print at a time: a second one waits for the owner to try again.
  if (busy) return { ok: false, reason: 'busy' };
  busy = true;
  let window: BrowserWindow | null = new BrowserWindow({
    ...A4_PORTRAIT,
    show: false,
    webPreferences: appWebPreferences(),
  });
  const id = window.webContents.id;
  let timer: NodeJS.Timeout | undefined;
  try {
    hardenWindow(window);
    const ready = new Promise<boolean>((resolve) => {
      waitingPages.set(id, resolve);
      timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
      window?.webContents.once('render-process-gone', () => resolve(false));
    });
    await loadRenderer(window, route);
    if (!(await ready)) {
      logger.warn('print.page_not_ready', { route: route.split('?')[0] ?? '' });
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, value: await use(window.webContents) };
  } catch (error) {
    logger.error('print.failed', describeError(error));
    return { ok: false, reason: 'failed' };
  } finally {
    clearTimeout(timer);
    waitingPages.delete(id);
    window.destroy();
    window = null;
    busy = false;
  }
}

/** Shows the Windows print dialog for the page. */
export function sendToPrinter(
  contents: WebContents,
  landscape: boolean,
): Promise<'printed' | 'cancelled'> {
  return new Promise((resolve, reject) => {
    contents.print({ silent: false, printBackground: true, landscape }, (success, reason) => {
      if (success) resolve('printed');
      else if (reason === 'cancelled') resolve('cancelled');
      else reject(new Error(`print failed: ${reason}`));
    });
  });
}

/** The page as an A4 PDF; the page's own CSS decides the orientation and page numbers. */
export function renderPdf(contents: WebContents): Promise<Buffer> {
  return contents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
}

/** Asks where to save a file, starting in Documents. Null when the owner cancels. */
export async function askWhereToSave(
  suggestedName: string,
  filter: { name: string; extension: 'pdf' | 'xlsx' },
): Promise<string | null> {
  const options = {
    defaultPath: join(
      app.getPath('documents'),
      `${safeFileName(suggestedName)}.${filter.extension}`,
    ),
    filters: [{ name: filter.name, extensions: [filter.extension] }],
  };
  const parent = BrowserWindow.getFocusedWindow();
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

/**
 * Writes a file the owner chose to save. False when it cannot be written, for
 * example because Windows keeps it locked while it is open in Excel.
 */
export async function saveFile(path: string, data: Buffer | Uint8Array): Promise<boolean> {
  try {
    await writeFile(path, data);
    return true;
  } catch (error) {
    logger.error('file.save_failed', describeError(error));
    return false;
  }
}
