import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createConnection,
  isDamageError,
  isIntact,
  readLanguageQuietly,
} from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { createRepositories } from '../../src/main/db/repositories';
import { areaInput } from './helpers';

let folder: string;
let file: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'rent-tracker-connection-'));
  file = join(folder, 'rent-tracker.db');
  const db = createConnection(file);
  migrate(db, MIGRATIONS);
  const repos = createRepositories(db);
  repos.settings.update({ language: 'ar' });
  const category = repos.categories.create({ name: 'Shops', color: null });
  if (!category.ok) throw new Error('category not created');
  for (let index = 1; index <= 60; index += 1) {
    repos.areas.create(areaInput(category.id, { name: `Shop ${index}`, notes: 'x'.repeat(500) }));
  }
  db.close();
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** Opens and checks the file the way the app does at startup. */
function startupCheck(): 'ok' | 'damaged' {
  try {
    const db = createConnection(file);
    try {
      return isIntact(db) ? 'ok' : 'damaged';
    } finally {
      db.close();
    }
  } catch (error) {
    if (isDamageError(error)) return 'damaged';
    throw error;
  }
}

describe('startup check of the data file', () => {
  it('passes a sound file and reads its language', () => {
    expect(startupCheck()).toBe('ok');
    expect(readLanguageQuietly(file)).toBe('ar');
  });

  it('finds a file whose pages were damaged', () => {
    const bytes = readFileSync(file);
    bytes.fill(0x55, 4096 * 2 + 50, 4096 * 6);
    writeFileSync(file, bytes);
    expect(startupCheck()).toBe('damaged');
  });

  it('finds a file that is not a database at all', () => {
    writeFileSync(file, 'this is not a database, the file was overwritten');
    expect(startupCheck()).toBe('damaged');
    expect(readLanguageQuietly(file)).toBeNull();
  });
});
