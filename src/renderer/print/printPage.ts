import { useEffect } from 'react';
import { callIpc } from '../app/ipc';

/** Print pages live under this address; the main process opens them in hidden windows. */
export const PRINT_PREFIX = '#/print/';

export function isPrintPage(): boolean {
  return window.location.hash.startsWith(PRINT_PREFIX);
}

/**
 * Tells the main process the page can be printed: once `ok` is known, after
 * fonts have loaded and the page has been drawn. The main process acts on the
 * first answer only.
 */
export function usePrintReady(ok: boolean | null): void {
  useEffect(() => {
    if (ok === null) return;
    let cancelled = false;
    void document.fonts.ready.then(() =>
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
