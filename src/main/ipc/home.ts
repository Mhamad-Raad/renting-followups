import { z } from 'zod';
import type { AttentionItem, HomeSummary } from '@shared/home';
import type { Repositories } from '../db/repositories';
import { currentYearMonth } from '../services/clock';
import { needsAttention, totalsByCurrency } from '../services/monthStatus';
import { handle } from './handle';

/** Only what the row shows is sent to the screen. */
const toAttentionItem = (area: AttentionItem): AttentionItem => ({
  id: area.id,
  name: area.name,
  categoryName: area.categoryName,
  categoryColor: area.categoryColor,
  currency: area.currency,
  renterName: area.renterName,
  renterPhone: area.renterPhone,
  standing: area.standing,
});

export function registerHomeIpc({ areas }: Repositories): void {
  handle('home:summary', z.undefined(), (): HomeSummary => {
    const today = currentYearMonth();
    const overviews = areas.overviews(today);
    return {
      year: today.year,
      totals: totalsByCurrency(overviews),
      attention: needsAttention(overviews).map(toAttentionItem),
    };
  });
}
