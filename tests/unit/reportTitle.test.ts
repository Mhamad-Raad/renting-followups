import { describe, expect, it } from 'vitest';
import { reportTitle } from '@shared/reportText';

// The key, then its values in order, to compare in one line.
const t = (...args: Parameters<typeof reportTitle>) => {
  const { key, values } = reportTitle(...args);
  return [key, ...Object.values(values)].join(' ');
};

describe('reportTitle', () => {
  it('names the year, or the chosen month, and the place or category when there is one', () => {
    expect(t({ year: 2026, month: null }, null, 'western')).toBe('print.title 2026');
    expect(t({ year: 2026, month: 10 }, 'Shops', 'western')).toBe('print.titleNamed 10/2026 Shops');
  });

  it('gives file names Western digits and no slash', () => {
    expect(t({ year: 2026, month: 10 }, 'Shops', 'arabic', true)).toBe(
      'print.fileNamed 10-2026 Shops',
    );
    expect(t({ year: 2026, month: null }, null, 'arabic', true)).toBe('print.file 2026');
  });
});
