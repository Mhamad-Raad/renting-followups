import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOGO_MAX_BYTES } from '@shared/settings';
import { createConnection, type Db } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { createKeyValueStore } from '../../src/main/db/repositories/settings';
import { createLogoStore } from '../../src/main/services/logo';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);

let db: Db;
let folder: string;
let directory: string;

beforeEach(() => {
  db = createConnection(':memory:');
  migrate(db, MIGRATIONS);
  folder = mkdtempSync(join(tmpdir(), 'rent-tracker-logo-'));
  directory = join(folder, 'logo');
});

afterEach(() => {
  db.close();
  rmSync(folder, { recursive: true, force: true });
});

const logoStore = () => createLogoStore(directory, createKeyValueStore(db));

describe('logo store', () => {
  it('has no logo at first', () => {
    expect(logoStore().read()).toBeNull();
  });

  it('keeps a copy of a PNG and gives it back as a data address', () => {
    const logo = logoStore();
    expect(logo.save(PNG)).toEqual({ ok: true });
    expect(logo.read()).toBe(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
    expect(readdirSync(directory)).toEqual(['logo.png']);
  });

  it('replaces a PNG with a JPEG and leaves one file only', () => {
    const logo = logoStore();
    logo.save(PNG);
    logo.save(JPEG);
    expect(logo.read()).toMatch(/^data:image\/jpeg;base64,/);
    expect(readdirSync(directory)).toEqual(['logo.jpg']);
  });

  it('refuses a file that is not a PNG or JPEG, whatever its name', () => {
    const logo = logoStore();
    expect(logo.save(new TextEncoder().encode('<svg onload="x()"></svg>'))).toEqual({
      ok: false,
      reason: 'not_image',
    });
    expect(logo.read()).toBeNull();
  });

  it('refuses a picture over the size limit', () => {
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(PNG);
    expect(logoStore().save(big)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('leaves no temporary file and keeps the old logo when the new one cannot be put in place', () => {
    const logo = logoStore();
    logo.save(PNG);
    // A folder where the new file should go makes the final swap fail.
    mkdirSync(join(directory, 'logo.jpg'));
    expect(() => logo.save(JPEG)).toThrow();
    expect(readdirSync(directory).sort()).toEqual(['logo.jpg', 'logo.png']);
    expect(logo.read()).toMatch(/^data:image\/png;base64,/);
  });

  it('removes the logo and its file', () => {
    const logo = logoStore();
    logo.save(PNG);
    logo.remove();
    expect(logo.read()).toBeNull();
    expect(existsSync(join(directory, 'logo.png'))).toBe(false);
  });

  it('ignores a stored name that is not its own file', () => {
    createKeyValueStore(db).write('logo_path', '../rent-tracker.db');
    expect(logoStore().read()).toBeNull();
  });
});
