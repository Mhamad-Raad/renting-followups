import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/connection';

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

/**
 * Writes a complete, consistent copy of the open database (SQLite's
 * `VACUUM INTO`, safe while the app is running) before risky operations such
 * as schema upgrades. Returns the path of the copy.
 */
export function writeSafetySnapshot(
  db: Db,
  directory: string,
  reason: string,
  now = new Date(),
): string {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${reason}_${fileTimestamp(now)}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}
