import type {
  AuthStatus,
  ChangePasswordInput,
  ChangeRecoveryPhraseInput,
  RecoverInput,
  SecretCheckResult,
  SetupInput,
  UnlockInput,
} from './auth';
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
  'auth:status': { input: undefined; output: AuthStatus };
  'auth:setup': { input: SetupInput; output: { ok: true } | { ok: false; reason: 'already_set' } };
  'auth:unlock': { input: UnlockInput; output: SecretCheckResult };
  'auth:recover': { input: RecoverInput; output: SecretCheckResult };
  'auth:changePassword': { input: ChangePasswordInput; output: SecretCheckResult };
  'auth:changeRecoveryPhrase': { input: ChangeRecoveryPhraseInput; output: SecretCheckResult };
}
export type IpcChannel = keyof IpcContract;
export type IpcInput<C extends IpcChannel> = IpcContract[C]['input'];
export type IpcOutput<C extends IpcChannel> = IpcContract[C]['output'];

/**
 * Which channels work while the app is locked: only what the lock screen
 * needs (its language and theme, crash reports, and unlocking itself). The
 * main process refuses every other channel until the password is entered.
 * A Record forces every channel of the contract to be listed here.
 */
export const OPEN_WHILE_LOCKED: Record<IpcChannel, boolean> = {
  'settings:get': true,
  'settings:update': false,
  'log:rendererError': true,
  'auth:status': true,
  'auth:setup': true,
  'auth:unlock': true,
  'auth:recover': true,
  'auth:changePassword': false,
  'auth:changeRecoveryPhrase': false,
};
export const IPC_CHANNELS = Object.keys(OPEN_WHILE_LOCKED) as IpcChannel[];

/** Error codes only; the screen turns them into plain translated sentences. */
export type IpcErrorCode = 'invalid_input' | 'locked' | 'unexpected';
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
