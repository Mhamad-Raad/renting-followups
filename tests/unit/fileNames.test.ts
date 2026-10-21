import { describe, expect, it } from 'vitest';
import { safeFileName } from '@shared/fileNames';

describe('safeFileName', () => {
  it('keeps ordinary names, including Kurdish and Arabic letters', () => {
    expect(safeFileName('Shop 12 - 2026')).toBe('Shop 12 - 2026');
    expect(safeFileName('دوکانی هەولێر')).toBe('دوکانی هەولێر');
  });

  it('replaces characters Windows forbids', () => {
    expect(safeFileName('A/B\\C:D*E?F"G<H>I|J')).toBe('A-B-C-D-E-F-G-H-I-J');
  });

  it('never ends in a dot or space and is never empty', () => {
    expect(safeFileName('Report. ')).toBe('Report');
    expect(safeFileName('   ')).toBe('Rent Tracker');
  });
});
