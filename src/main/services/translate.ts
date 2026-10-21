import type { Language } from '@shared/settings';
import ar from '../../renderer/i18n/ar.json';
import ckb from '../../renderer/i18n/ckb.json';
import en from '../../renderer/i18n/en.json';

type Tree = { [key: string]: string | Tree };
const TRANSLATIONS: Record<Language, Tree> = { ckb, en, ar };

/**
 * The screen's own translation files, for the few texts the main process
 * writes itself (Excel sheets, suggested file names). Same keys and
 * `{{name}}` placeholders as on screen; an unknown key comes back unchanged.
 */
export function translate(
  language: Language,
  key: string,
  values: Record<string, string> = {},
): string {
  let node: string | Tree | undefined = TRANSLATIONS[language];
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'string') return key;
  return node.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match);
}
