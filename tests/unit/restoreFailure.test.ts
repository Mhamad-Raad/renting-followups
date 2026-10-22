import type * as fs from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createConnection } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { createBackup } from '../../src/main/services/backup';
import { checkBackup } from '../../src/main/services/backupCheck';
import {
  applyReadyRestore,
  confirmRestore,
  type RestorePaths,
} from '../../src/main/services/restore';

// Lets a test make one rename fail, as a locked file on Windows would.
const failRenameTo = vi.hoisted(() => ({ target: null as string | null }));
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof fs>();
  return {
    ...original,
    renameSync: (from: fs.PathLike, to: fs.PathLike) => {
      if (to === failRenameTo.target) throw new Error('EBUSY: the file is in use');
      original.renameSync(from, to);
    },
  };
});

let root: string;
let paths: RestorePaths;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rent-tracker-restore-fail-'));
  mkdirSync(join(root, 'data'));
  paths = {
    staging: join(root, 'data', 'restore'),
    database: join(root, 'data', 'rent-tracker.db'),
    logoFolder: join(root, 'data', 'logo'),
    safetyFolder: join(root, 'data', 'safety-copies'),
  };
});

afterEach(() => {
  failRenameTo.target = null;
  rmSync(root, { recursive: true, force: true });
});

it('puts everything back when the backup cannot be put in place', async () => {
  const source = createConnection(join(root, 'source.db'));
  migrate(source, MIGRATIONS);
  source.prepare("INSERT INTO settings (key, value) VALUES ('password_hash', 'h')").run();
  const name = await createBackup(source, root, '2026-10-01', null);
  source.close();

  // The current data: a damaged file with a journal beside it, which must survive.
  writeFileSync(paths.database, 'current data');
  writeFileSync(`${paths.database}-wal`, 'current journal');
  const { info } = checkBackup(join(root, name), paths, MIGRATIONS);
  if (info) confirmRestore(paths, info);

  failRenameTo.target = paths.database;
  expect(applyReadyRestore(paths, new Date(2026, 9, 22))).toEqual({
    ok: false,
    madeOn: '2026-10-01',
  });
  expect(readFileSync(paths.database, 'utf8')).toBe('current data');
  expect(readFileSync(`${paths.database}-wal`, 'utf8')).toBe('current journal');
  // Nothing is left waiting, so the next start opens the current data as before.
  expect(existsSync(join(paths.staging, 'ready.db'))).toBe(false);
});
