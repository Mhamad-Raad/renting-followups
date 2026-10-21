import type { CategoryColor } from './categories';
import type { Currency } from './currency';
import type { AreaStanding } from './months';

/** One currency's cards on Home. Totals are never mixed across currencies. */
export interface CurrencyTotals {
  currency: Currency;
  /** Money received for this year's rent months. */
  received: number;
  /** Still owed this year, up to and including this month. */
  remaining: number;
  /** Areas with a late month in any year. */
  lateAreas: number;
}

/** A row of "Needs attention now": an area that is late (any year) or due this month. */
export interface AttentionItem {
  id: number;
  name: string;
  categoryName: string;
  categoryColor: CategoryColor | null;
  currency: Currency;
  renterName: string | null;
  renterPhone: string | null;
  standing: AreaStanding;
}

export interface HomeSummary {
  year: number;
  /** Only currencies that have areas, IQD first. */
  totals: CurrencyTotals[];
  /** Most late months first. */
  attention: AttentionItem[];
}
