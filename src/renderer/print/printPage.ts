import { useEffect } from 'react';
import { callIpc } from '../app/ipc';

/** Print pages live under this address; the main process opens them in hidden windows. */
export const PRINT_PREFIX = '#/print/';

export function isPrintPage(): boolean {
  return window.location.hash.startsWith(PRINT_PREFIX);
}

/** Waits until every picture on the page (the logo) can be drawn; a broken one is skipped. */
function picturesReady(): Promise<unknown> {
  return Promise.all(Array.from(document.images, (image) => image.decode().catch(() => null)));
}

/**
 * Tells the main process the page can be printed: once `ok` is known, after
 * fonts and pictures have loaded and the page has been drawn. The main
 * process acts on the first answer only.
 */
export function usePrintReady(ok: boolean | null): void {
  useEffect(() => {
    if (ok === null) return;
    let cancelled = false;
    void Promise.all([document.fonts.ready, picturesReady()]).then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) void callIpc('print:ready', { ok });
        }),
      ),
    );
    return () => {
      cancelled = true;
    };
  }, [ok]);
}
