import { useCallback, useEffect, useRef, useState } from 'react';
import type { InvokeArgs, IpcChannel, IpcErrorCode, IpcOutput, IpcResult } from '@shared/ipc';

/** Calls the main process. Never throws: a broken bridge becomes an 'unexpected' error. */
export async function callIpc<C extends IpcChannel>(
  channel: C,
  ...args: InvokeArgs<C>
): Promise<IpcResult<IpcOutput<C>>> {
  try {
    return await window.api.invoke(channel, ...args);
  } catch {
    return { ok: false, error: 'unexpected' };
  }
}

export type QueryState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: IpcErrorCode };

/**
 * Loads data from the main process when the component appears and whenever
 * the input changes. Answers that arrive after the component is gone, or after
 * a newer request, are ignored, so there are no stale updates or leaks.
 */
export function useIpcQuery<C extends IpcChannel>(channel: C, ...args: InvokeArgs<C>) {
  const [state, setState] = useState<QueryState<IpcOutput<C>>>({ status: 'loading' });
  const [reloadCount, setReloadCount] = useState(0);
  const latestRequest = useRef(0);
  const argsKey = JSON.stringify(args);

  useEffect(() => {
    const request = ++latestRequest.current;
    let active = true;
    const input = JSON.parse(argsKey) as InvokeArgs<C>;
    void callIpc(channel, ...input).then((result) => {
      if (!active || request !== latestRequest.current) return;
      setState(
        result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'error', error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [channel, argsKey, reloadCount]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setReloadCount((count) => count + 1);
  }, []);
  /** Replaces the loaded data, for example with the result of a save, or derives it from the current data. */
  const setData = useCallback(
    (next: IpcOutput<C> | ((current: IpcOutput<C>) => IpcOutput<C>)) =>
      setState((previous) => {
        if (typeof next !== 'function') return { status: 'ready', data: next };
        return previous.status === 'ready'
          ? { status: 'ready', data: next(previous.data) }
          : previous;
      }),
    [],
  );

  return { state, reload, setData };
}
