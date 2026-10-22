import type { DateString } from './dates';

/** How many backups are kept in the folder; older ones made by the app are removed. */
export const BACKUPS_KEPT = 12;

/** What Settings shows about backups. */
export interface BackupStatus {
  /** The chosen backup folder; null until one is chosen. */
  folder: string | null;
  /** The folder is not there now, for example a USB drive that is not plugged in. */
  folderMissing: boolean;
  /** The folder is on the same drive as the app's data. */
  sameDrive: boolean;
  lastBackupOn: DateString | null;
}

export type BackupResult =
  | { ok: true; done: 'saved'; fileName: string }
  | { ok: true; done: 'cancelled' }
  | { ok: false; reason: 'folder_missing' | 'failed' };

export type FolderChoice = { ok: true; done: 'chosen' | 'cancelled' };

/** What the owner sees about a chosen backup before confirming the restore. */
export interface BackupInfo {
  fileName: string;
  /** The day the backup was made (from its name, else the file's date). */
  madeOn: DateString;
  /** Areas and receipts in use in the backup. */
  areas: number;
  receipts: number;
  hasLogo: boolean;
}

/** Why a chosen file cannot be restored. */
export type RestoreRefusal = 'not_backup' | 'damaged' | 'too_new' | 'cannot_upgrade';

export type RestoreCheck = { ok: true } | { ok: false; reason: RestoreRefusal };

export type RestoreChoice =
  | { ok: true; done: 'cancelled' }
  | { ok: true; done: 'checked'; info: BackupInfo }
  | { ok: false; reason: RestoreRefusal | 'failed' };

/** How the last restore went, shown once after the restart. */
export interface RestoreOutcome {
  ok: boolean;
  madeOn: DateString | null;
}
