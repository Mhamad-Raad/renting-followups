import { existsSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOGO_MAX_BYTES } from '@shared/settings';
import type { KeyValueStore } from '../db/repositories/settings';

/**
 * The print logo (ARCHITECTURE.md section 12): a copy of the chosen picture
 * kept in the app's data folder, so it still prints if the original is moved.
 * Only PNG and JPEG are accepted, recognised by their first bytes rather than
 * the file name. The setting `logo_path` holds the copy's file name.
 */

const LOGO_KEY = 'logo_path';
const KINDS = {
  png: { file: 'logo.png', mime: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47] },
  jpeg: { file: 'logo.jpg', mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
} as const;
type LogoKind = keyof typeof KINDS;

function kindOf(bytes: Uint8Array): LogoKind | null {
  for (const kind of Object.keys(KINDS) as LogoKind[]) {
    if (KINDS[kind].signature.every((byte, index) => bytes[index] === byte)) return kind;
  }
  return null;
}

export type LogoSaveResult = { ok: true } | { ok: false; reason: 'too_large' | 'not_image' };

export function createLogoStore(directory: string, store: KeyValueStore) {
  /** The stored kind; anything else in the setting (for example a hand-edited path) is ignored. */
  const storedKind = (): LogoKind | null => {
    const name = store.read(LOGO_KEY);
    return (Object.keys(KINDS) as LogoKind[]).find((kind) => KINDS[kind].file === name) ?? null;
  };

  const removeFiles = (keep: LogoKind | null) => {
    for (const kind of Object.keys(KINDS) as LogoKind[]) {
      if (kind !== keep) rmSync(join(directory, KINDS[kind].file), { force: true });
    }
  };

  return {
    save(bytes: Uint8Array): LogoSaveResult {
      if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: 'too_large' };
      const kind = kindOf(bytes);
      if (!kind) return { ok: false, reason: 'not_image' };
      mkdirSync(directory, { recursive: true });
      const file = join(directory, KINDS[kind].file);
      // Written beside the old logo and swapped in whole, so a failure never leaves half a picture.
      const temporary = `${file}.tmp`;
      try {
        writeFileSync(temporary, bytes);
        renameSync(temporary, file);
      } finally {
        rmSync(temporary, { force: true });
      }
      store.write(LOGO_KEY, KINDS[kind].file);
      removeFiles(kind);
      return { ok: true };
    },

    /** The logo as a data address the screen can show without file access; null when there is none. */
    read(): string | null {
      const kind = storedKind();
      if (!kind) return null;
      const file = join(directory, KINDS[kind].file);
      if (!existsSync(file)) return null;
      return `data:${KINDS[kind].mime};base64,${readFileSync(file).toString('base64')}`;
    },

    remove(): void {
      store.remove(LOGO_KEY);
      removeFiles(null);
    },
  };
}

export type LogoStore = ReturnType<typeof createLogoStore>;
