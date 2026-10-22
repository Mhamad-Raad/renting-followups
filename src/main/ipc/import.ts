import { basename } from 'node:path';
import { z } from 'zod';
import type { ImportChoice, ImportResult, ImportRow, TemplateResult } from '@shared/import';
import type { Db } from '../db/connection';
import type { Repositories } from '../db/repositories';
import { currentYearMonth } from '../services/clock';
import { askToOpen } from '../services/dialogs';
import {
  buildImportTemplate,
  checkTable,
  importAreas,
  importContext,
  readTable,
} from '../services/importAreas';
import { describeError, logger } from '../services/logger';
import { askWhereToSave, saveFile } from '../services/pdf';
import { translate } from '../services/translate';
import { handle } from './handle';

/**
 * Importing areas (ARCHITECTURE.md section 16). The screen never sends a file
 * path or rows: the main process asks for the file, keeps the checked rows,
 * and imports exactly those when the owner confirms.
 */
export function registerImportIpc(db: Db, repos: Repositories): void {
  let checked: ImportRow[] | null = null;
  const language = () => repos.settings.getAll().language;
  const t = (key: string) => translate(language(), key);

  handle('import:template', z.undefined(), async (): Promise<TemplateResult> => {
    const path = await askWhereToSave(t('import.template.fileName'), {
      name: t('import.template.files'),
      extension: 'xlsx',
    });
    if (!path) return { ok: true, done: 'cancelled' };
    try {
      const workbook = buildImportTemplate(language(), currentYearMonth().year);
      await saveFile(path, new Uint8Array(await workbook.xlsx.writeBuffer()));
      return { ok: true, done: 'saved' };
    } catch (error) {
      logger.error('import.template_failed', describeError(error));
      return { ok: false };
    }
  });

  handle('import:choose', z.undefined(), async (): Promise<ImportChoice> => {
    const file = await askToOpen({
      properties: ['openFile'],
      filters: [{ name: t('import.template.importFiles'), extensions: ['xlsx', 'csv'] }],
    });
    // Cancelling keeps the preview already on screen, and its rows.
    if (!file) return { ok: true, done: 'cancelled' };
    checked = null;
    const table = await readTable(file);
    if (table === null) return { ok: false, reason: 'not_readable' };
    if (table === 'too_large') return { ok: false, reason: 'too_large' };
    const result = checkTable(table, basename(file), importContext(repos, currentYearMonth().year));
    if (result.ok) checked = result.preview.rows;
    logger.info('import.checked', {
      rows: result.ok ? result.preview.rows.length : 0,
      skipped: result.ok ? result.preview.problems.length : 0,
    });
    return result;
  });

  handle('import:apply', z.undefined(), (): ImportResult => {
    if (!checked || checked.length === 0) return { ok: false, reason: 'nothing_checked' };
    const result = importAreas(db, repos, checked);
    checked = null;
    logger.info('import.done', result.ok ? { areas: result.areas } : { reason: result.reason });
    return result;
  });
}
