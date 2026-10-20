import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeError, initLogger, logger } from '../../src/main/services/logger';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'rent-tracker-logs-'));
  initLogger(directory);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('logger', () => {
  it('writes one JSON line per event', () => {
    logger.info('app.started', { schemaVersion: 1 });
    const [line] = readFileSync(join(directory, 'app.log'), 'utf8').trim().split('\n');
    expect(JSON.parse(line ?? '')).toMatchObject({
      level: 'info',
      event: 'app.started',
      schemaVersion: 1,
    });
  });

  it('rotates at about 1 MB and keeps three old files', () => {
    const padding = 'x'.repeat(10_000);
    for (let index = 0; index < 500; index += 1) logger.info('filler', { padding });
    const files = readdirSync(directory).sort();
    expect(files).toEqual(['app.1.log', 'app.2.log', 'app.3.log', 'app.log']);
    expect(existsSync(join(directory, 'app.4.log'))).toBe(false);
  });
});

describe('describeError', () => {
  it('keeps the error type and stack frames but never the message', () => {
    const details = describeError(new TypeError('Renter Karwan 07501234567'));
    expect(details['errorName']).toBe('TypeError');
    expect(String(details['stack'])).toContain('at ');
    expect(JSON.stringify(details)).not.toContain('Karwan');
    expect(JSON.stringify(details)).not.toContain('0750');
  });

  it('handles values that are not errors', () => {
    expect(describeError('secret text')).toEqual({ errorName: 'string' });
  });
});
