import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHANGES_DATA,
  type InvokeArgs,
  type IpcChannel,
  type IpcErrorCode,
  type IpcOutput,
  type IpcResult,
} from '@shared/ipc';
import { announceDataChanged } from './dataChanged';

/** Calls the main process. Never throws: a broken bridge becomes an 'unexpected' error. */
export async function callIpc<C extends IpcChannel>(
  channel: C,
  ...args: InvokeArgs<C>
): Promise<IpcResult<IpcOutput<C>>> {
  try {
    const result = await window.api.invoke(channel, ...args);
    if (result.ok && CHANGES_DATA[channel]) announceDataChanged();
    return result;
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

  /** Loads again from scratch, showing the loading state (for "Try again" after an error). */
  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setReloadCount((count) => count + 1);
  }, []);
  /** Loads again while the current data stays on screen (after a change was saved). */
  const refresh = useCallback(() => setReloadCount((count) => count + 1), []);
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

  return { state, reload, refresh, setData };
}
