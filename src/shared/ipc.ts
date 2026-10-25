import type {
  BackupResult,
  BackupStatus,
  FolderChoice,
  RestoreChoice,
  RestoreOutcome,
} from './backup';
import type { ActivityPage, ActivityQuery } from './audit';
import type { ImportChoice, ImportResult, TemplateResult } from './import';
import type {
  AuthStatus,
  ChangePasswordInput,
  ChangeRecoveryPhraseInput,
  RecoverInput,
  SecretCheckResult,
  SetupInput,
  UnlockInput,
} from './auth';
import type {
  AreaCreate,
  AreaDetails,
  AreaListItem,
  AreaListQuery,
  AreaSaveResult,
  AreaUpdate,
  AreaYearQuery,
  DeletedItems,
  PriceChange,
  PriceChangeImpact,
  PriceChangeResult,
  RenterChange,
  RenterChangeResult,
  RestoreResult,
} from './areas';
import type {
  Category,
  CategoryDeleteResult,
  CategoryInput,
  CategorySaveResult,
  CategoryUpdate,
  IdInput,
} from './categories';
import type { YearMonth } from './dates';
import type { HomeSummary } from './home';
import type { AreaYear } from './months';
import type { Reminder } from './notifications';
import type {
  AllocationResult,
  AreaMonth,
  AreaPaymentsQuery,
  AreaReceiptsQuery,
  PaymentCreate,
  PaymentCreateResult,
  PaymentPreviewQuery,
  PaymentUpdate,
  PaymentUpdateResult,
  MonthTakeOutResult,
  PaymentVoidResult,
  Receipt,
} from './payments';
import type {
  ExportReportInput,
  PrintReady,
  PrintReceiptInput,
  PrintReportInput,
  PrintResult,
  ReceiptPrintData,
} from './printing';
import type { Report, ReportFilters, ReportQuery } from './reports';
import type { LogoChoiceResult, Settings, SettingsUpdate } from './settings';

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
  /** The print logo as a data address, or null when there is none. */
  'settings:logo': { input: undefined; output: string | null };
  'settings:chooseLogo': { input: undefined; output: LogoChoiceResult };
  'settings:removeLogo': { input: undefined; output: null };
  'log:rendererError': { input: RendererErrorReport; output: null };
  'auth:status': { input: undefined; output: AuthStatus };
  'auth:setup': { input: SetupInput; output: { ok: true } | { ok: false; reason: 'already_set' } };
  'auth:unlock': { input: UnlockInput; output: SecretCheckResult };
  'auth:recover': { input: RecoverInput; output: SecretCheckResult };
  'auth:changePassword': { input: ChangePasswordInput; output: SecretCheckResult };
  'auth:changeRecoveryPhrase': { input: ChangeRecoveryPhraseInput; output: SecretCheckResult };
  'categories:list': { input: undefined; output: Category[] };
  'categories:create': { input: CategoryInput; output: CategorySaveResult };
  'categories:update': { input: CategoryUpdate; output: CategorySaveResult };
  'categories:delete': { input: IdInput; output: CategoryDeleteResult };
  'categories:restore': { input: IdInput; output: RestoreResult };
  'areas:list': { input: AreaListQuery; output: AreaListItem[] };
  'areas:get': { input: IdInput; output: AreaDetails | null };
  'areas:year': { input: AreaYearQuery; output: AreaYear | null };
  'areas:create': { input: AreaCreate; output: AreaSaveResult };
  'areas:update': { input: AreaUpdate; output: AreaSaveResult };
  'areas:priceChangeImpact': { input: PriceChange; output: PriceChangeImpact | null };
  'areas:changePrice': { input: PriceChange; output: PriceChangeResult };
  'areas:changeRenter': { input: RenterChange; output: RenterChangeResult };
  'areas:delete': { input: IdInput; output: { ok: true } | { ok: false; reason: 'not_found' } };
  'areas:restore': { input: IdInput; output: RestoreResult };
  'deleted:list': { input: undefined; output: DeletedItems };
  'activity:list': { input: ActivityQuery; output: ActivityPage };
  'backup:status': { input: undefined; output: BackupStatus };
  'backup:chooseFolder': { input: undefined; output: FolderChoice };
  'backup:now': { input: undefined; output: BackupResult };
  'restore:choose': { input: undefined; output: RestoreChoice };
  /** Confirms the backup checked by restore:choose; the app then restarts to put it in place. */
  'restore:apply': { input: undefined; output: { ok: boolean } };
  /** The owner said no to the checked backup; its copy is removed. */
  'restore:cancel': { input: undefined; output: null };
  /** How a restore at this start went, for the lock screen; null when there was none. */
  'restore:result': { input: undefined; output: RestoreOutcome | null };
  /** Saves the import template where the owner chooses. */
  'import:template': { input: undefined; output: TemplateResult };
  /** Asks for a file and checks it; the preview waits in the main process for import:apply. */
  'import:choose': { input: undefined; output: ImportChoice };
  /** Imports the areas of the file checked by import:choose. */
  'import:apply': { input: undefined; output: ImportResult };
  'payments:forArea': { input: AreaReceiptsQuery; output: Receipt[] };
  'payments:suggestedStart': { input: AreaPaymentsQuery; output: YearMonth | null };
  'payments:preview': { input: PaymentPreviewQuery; output: AllocationResult | null };
  'payments:create': { input: PaymentCreate; output: PaymentCreateResult };
  'payments:update': { input: PaymentUpdate; output: PaymentUpdateResult };
  'payments:void': { input: IdInput; output: PaymentVoidResult };
  'payments:monthTakeOutPreview': { input: AreaMonth; output: MonthTakeOutResult };
  'payments:monthTakeOut': { input: AreaMonth; output: MonthTakeOutResult };
  'clock:check': { input: undefined; output: { looksWrong: boolean } };
  'home:summary': { input: undefined; output: HomeSummary };
  'reports:build': { input: ReportQuery; output: Report };
  'reports:lastFilters': { input: undefined; output: ReportFilters };
  'reports:rememberFilters': { input: ReportFilters; output: null };
  'print:ready': { input: PrintReady; output: null };
  'print:receiptData': { input: IdInput; output: ReceiptPrintData | null };
  'print:receipt': { input: PrintReceiptInput; output: PrintResult };
  'print:report': { input: PrintReportInput; output: PrintResult };
  'export:reportExcel': { input: ExportReportInput; output: PrintResult };
  'notifications:list': { input: undefined; output: Reminder[] };
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
  'settings:logo': false,
  'settings:chooseLogo': false,
  'settings:removeLogo': false,
  'log:rendererError': true,
  'auth:status': true,
  'auth:setup': true,
  'auth:unlock': true,
  'auth:recover': true,
  'auth:changePassword': false,
  'auth:changeRecoveryPhrase': false,
  'categories:list': false,
  'categories:create': false,
  'categories:update': false,
  'categories:delete': false,
  'categories:restore': false,
  'areas:list': false,
  'areas:get': false,
  'areas:year': false,
  'areas:create': false,
  'areas:update': false,
  'areas:priceChangeImpact': false,
  'areas:changePrice': false,
  'areas:changeRenter': false,
  'areas:delete': false,
  'areas:restore': false,
  'deleted:list': false,
  'activity:list': false,
  'backup:status': false,
  'backup:chooseFolder': false,
  'backup:now': false,
  'restore:choose': false,
  'restore:apply': false,
  'restore:cancel': false,
  'restore:result': true,
  'import:template': false,
  'import:choose': false,
  'import:apply': false,
  'payments:forArea': false,
  'payments:suggestedStart': false,
  'payments:preview': false,
  'payments:create': false,
  'payments:update': false,
  'payments:void': false,
  'payments:monthTakeOutPreview': false,
  'payments:monthTakeOut': false,
  'clock:check': false,
  'home:summary': false,
  'reports:build': false,
  'reports:lastFilters': false,
  'reports:rememberFilters': false,
  'print:ready': false,
  'print:receiptData': false,
  'print:receipt': false,
  'print:report': false,
  'export:reportExcel': false,
  'notifications:list': false,
};

/**
 * Which channels change the rent data, so screens that summarise it (the
 * bell's count) know to look again. A Record forces every channel to be listed.
 */
export const CHANGES_DATA: Record<IpcChannel, boolean> = {
  'settings:get': false,
  'settings:update': true,
  'settings:logo': false,
  'settings:chooseLogo': false,
  'settings:removeLogo': false,
  'log:rendererError': false,
  'auth:status': false,
  'auth:setup': false,
  'auth:unlock': false,
  'auth:recover': false,
  'auth:changePassword': false,
  'auth:changeRecoveryPhrase': false,
  'categories:list': false,
  'categories:create': true,
  'categories:update': true,
  'categories:delete': true,
  'categories:restore': true,
  'areas:list': false,
  'areas:get': false,
  'areas:year': false,
  'areas:create': true,
  'areas:update': true,
  'areas:priceChangeImpact': false,
  'areas:changePrice': true,
  'areas:changeRenter': true,
  'areas:delete': true,
  'areas:restore': true,
  'deleted:list': false,
  'activity:list': false,
  'backup:status': false,
  'backup:chooseFolder': false,
  'backup:now': true,
  'restore:choose': false,
  'restore:apply': false,
  'restore:cancel': false,
  'restore:result': false,
  'import:template': false,
  'import:choose': false,
  'import:apply': true,
  'payments:forArea': false,
  'payments:suggestedStart': false,
  'payments:preview': false,
  'payments:create': true,
  'payments:update': true,
  'payments:void': true,
  'payments:monthTakeOutPreview': false,
  'payments:monthTakeOut': true,
  'clock:check': false,
  'home:summary': false,
  'reports:build': false,
  'reports:lastFilters': false,
  'reports:rememberFilters': false,
  'print:ready': false,
  'print:receiptData': false,
  'print:receipt': false,
  'print:report': false,
  'export:reportExcel': false,
  'notifications:list': false,
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
