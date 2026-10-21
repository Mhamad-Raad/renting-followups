import { describe, expect, it } from 'vitest';
import { phoneForDisplay } from '@shared/digits';

const LRM = '‎';

describe('phoneForDisplay', () => {
  it('leaves Western digits as typed', () => {
    expect(phoneForDisplay('0750 123 4567', 'western')).toBe('0750 123 4567');
    expect(phoneForDisplay('٠٧٥٠ ١٢٣', 'western')).toBe('0750 123');
  });

  it('keeps Arabic-Indic digit groups in order with left-to-right marks around separators', () => {
    expect(phoneForDisplay('0750 123-4567', 'arabic')).toBe(
      `٠٧٥٠${LRM} ${LRM}١٢٣${LRM}-${LRM}٤٥٦٧`,
    );
    expect(phoneForDisplay('+964 750', 'arabic')).toBe(`${LRM}+${LRM}٩٦٤${LRM} ${LRM}٧٥٠`);
  });

  it('reads back as the same digits once the invisible marks are removed', () => {
    expect(phoneForDisplay('0750 123 4567', 'arabic').replaceAll(LRM, '')).toBe('٠٧٥٠ ١٢٣ ٤٥٦٧');
  });
});
