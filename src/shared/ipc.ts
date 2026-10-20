import type { Settings, SettingsUpdate } from './settings';

/** A renderer crash report: error type and stack frames, never the message. */
export interface RendererErrorReport {
  name: string;
  stack: string;
}

/**
 * Every call the screen can make to the main process, with its input and
 * output. The main process validates every input with zod before using it.
 */
export interface IpcContract {
  'settings:get': { input: undefined; output: Settings };
  'settings:update': { input: SettingsUpdate; output: Settings };
  'log:rendererError': { input: RendererErrorReport; output: null };
}
export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = IpcContract[C]['input'];
export type IpcOutput<C extends IpcChannel> = IpcContract[C]['output'];

// A Record forces every channel of the contract to be listed here.
const CHANNELS: Record<IpcChannel, true> = {
  'settings:get': true,
  'settings:update': true,
  'log:rendererError': true,
};
export const IPC_CHANNELS = Object.keys(CHANNELS) as IpcChannel[];

/** Error codes only; the screen turns them into plain translated sentences. */
export type IpcErrorCode = 'invalid_input' | 'unexpected';
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorCode };

/** The arguments after the channel name: none when the channel takes no input. */
export type InvokeArgs<C extends IpcChannel> =
  IpcInput<C> extends undefined ? [] : [input: IpcInput<C>];

/** What the preload script exposes to the screen as `window.api`. */
export interface RendererApi {
  invoke<C extends IpcChannel>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<IpcResult<IpcOutput<C>>>;
}
