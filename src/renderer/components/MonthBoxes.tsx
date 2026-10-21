import { memo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { formatAmount, formatPlain } from '@shared/formatNumber';
import type { MonthBox, MonthStatus, YearSummary } from '@shared/months';
import { useSettings } from '../app/SettingsContext';
import styles from './MonthBoxes.module.css';

type MonthWord = Exclude<MonthStatus, 'not_applicable'> | 'vacant' | 'notStarted';

/** The word under a box. A month that is not applicable says why: vacant, or rent not started. */
function monthWord({ status, expected }: MonthBox): MonthWord {
  if (status !== 'not_applicable') return status;
  return expected === 0 ? 'vacant' : 'notStarted';
}

/** The compact strip has no room for words: a symbol beside the colour, so colour is never the only signal. */
const SYMBOLS: Record<MonthWord, string> = {
  paid: '✓',
  due: '•',
  partial: '½',
  late: '!',
  upcoming: '',
  vacant: '–',
  notStarted: '–',
};

/** The colour family of a year summary, matching the month colours. */
const SUMMARY_COLOR: Record<YearSummary, MonthStatus> = {
  late: 'late',
  due: 'due',
  partial: 'partial',
  paid: 'paid',
  nothing_due: 'upcoming',
};

interface MonthBoxesProps {
  boxes: readonly MonthBox[];
  year: number;
  currency: Currency;
  /** A thin strip of symbols for lists, instead of large boxes with amounts. */
  compact?: boolean;
}

/**
 * The 12 months of a year in their status colours, each with its month number
 * (or symbol) and status word. The statuses come from the main process.
 */
export const MonthBoxes = memo(function MonthBoxes({
  boxes,
  year,
  currency,
  compact = false,
}: MonthBoxesProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  const label = (box: MonthBox) =>
    t('months.box', {
      month: formatPlain(box.month, digits),
      status: t(`months.status.${monthWord(box)}`),
    });

  if (compact) {
    return (
      <ol
        className={styles.strip}
        aria-label={t('months.title', { year: formatPlain(year, digits) })}
      >
        {boxes.map((box) => (
          <li
            key={box.month}
            className={styles.cell}
            data-status={box.status}
            title={label(box)}
            aria-label={label(box)}
          >
            <span aria-hidden="true">{SYMBOLS[monthWord(box)]}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className={styles.container}>
      <ol
        className={styles.grid}
        aria-label={t('months.title', { year: formatPlain(year, digits) })}
      >
        {boxes.map((box, index) => (
          <li
            key={box.month}
            className={styles.box}
            data-status={box.status}
            aria-label={label(box)}
            style={{ '--index': index } as CSSProperties}
          >
            <span className={styles.number} aria-hidden="true">
              {formatPlain(box.month, digits)}
            </span>
            <span className={styles.amount} aria-hidden="true">
              {box.paid > 0 && (
                <bdi dir="ltr">{formatAmount(box.paid, FRACTION_DIGITS[currency], digits)}</bdi>
              )}
            </span>
            <span className={styles.word} aria-hidden="true">
              {t(`months.status.${monthWord(box)}`)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
});

/** One word for a whole year (Late, Due, Paid…), in the matching colour. */
export function YearSummaryText({ summary }: { summary: YearSummary }) {
  const { t } = useTranslation();
  return (
    <span className={styles.summary} data-status={SUMMARY_COLOR[summary]}>
      {t(`months.summary.${summary}`)}
    </span>
  );
}
