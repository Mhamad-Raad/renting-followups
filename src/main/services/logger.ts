import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Log details are IDs, codes and counts only. Names, phone numbers, amounts
 * and any other text the owner typed must never be passed to the logger.
 */
export type LogDetails = Record<string, string | number | boolean>;
type Level = 'info' | 'warn' | 'error';

const FILE_NAME = 'app.log';
const MAX_FILE_BYTES = 1_000_000;
const KEPT_OLD_FILES = 3;
const MAX_STACK_FRAMES = 12;

let logDirectory: string | null = null;

export function initLogger(directory: string): void {
  mkdirSync(directory, { recursive: true });
  logDirectory = directory;
}

/** app.log → app.1.log → app.2.log → app.3.log; the oldest is deleted. */
function rotate(directory: string): void {
  const current = join(directory, FILE_NAME);
  if (!existsSync(current) || statSync(current).size < MAX_FILE_BYTES) return;
  const archived = (index: number) => join(directory, `app.${index}.log`);
  rmSync(archived(KEPT_OLD_FILES), { force: true });
  for (let index = KEPT_OLD_FILES - 1; index >= 1; index -= 1) {
    if (existsSync(archived(index))) renameSync(archived(index), archived(index + 1));
  }
  renameSync(current, archived(1));
}

function write(level: Level, event: string, details: LogDetails = {}): void {
  if (!logDirectory) return;
  try {
    rotate(logDirectory);
    const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...details });
    appendFileSync(join(logDirectory, FILE_NAME), `${line}\n`);
  } catch {
    // Logging must never crash the app or block the owner's work.
  }
}

export const logger = {
  info: (event: string, details?: LogDetails) => write('info', event, details),
  warn: (event: string, details?: LogDetails) => write('warn', event, details),
  error: (event: string, details?: LogDetails) => write('error', event, details),
};

/**
 * Describes an error by its type and stack frames only. The message is left
 * out on purpose because it can contain data the owner typed.
 */
export function describeError(error: unknown): LogDetails {
  if (!(error instanceof Error)) return { errorName: typeof error };
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => line.trim());
  return { errorName: error.name, stack: frames.join(' | ') };
}
