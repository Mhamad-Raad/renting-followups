import { memo, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { formatAmount, formatPlain } from '@shared/formatNumber';
import type { MonthBox, MonthStatus, YearSummary } from '@shared/months';
import { useSettings } from '../app/SettingsContext';
import styles from './MonthBoxes.module.css';

type MonthWord = Exclude<MonthStatus, 'not_applicable'> | 'vacant' | 'notStarted';

/** The word for a month. One that is not applicable says why: vacant (rent 0), or rent not started. */
/** Lets a line of a month box shrink to fit the box instead of breaking (see `--chars` in the CSS). */
const fitted = (text: string) => ({ '--chars': Math.max(text.length, 1) }) as CSSProperties;

export function monthWord({ status, expected }: Pick<MonthBox, 'status' | 'expected'>): MonthWord {
  if (status !== 'not_applicable') return status;
  return expected === 0 ? 'vacant' : 'notStarted';
}

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
  /** A thin strip of month numbers for lists and prints, instead of large boxes with amounts. */
  compact?: boolean;
  /** The month chosen in the filter, outlined. */
  selected?: number | null;
  /** Makes every month with rent a button (ARCHITECTURE.md section 7.4). */
  onPick?: ((box: MonthBox) => void) | undefined;
}

/**
 * The 12 months of a year in their status colours, each with its month number
 * (and, in the large boxes, the amount and status word). The statuses come
 * from the main process.
 */
export const MonthBoxes = memo(function MonthBoxes({
  boxes,
  year,
  currency,
  compact = false,
  selected = null,
  onPick,
}: MonthBoxesProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  const label = (box: MonthBox) =>
    t('months.box', {
      month: formatPlain(box.month, digits),
      status: t(`months.status.${monthWord(box)}`),
    });
  const canPick = (box: MonthBox) => onPick !== undefined && box.status !== 'not_applicable';
  // A month with rent becomes a button; it says what a click does, and keeps a row click from opening the area.
  const pickProps = (box: MonthBox) => ({
    type: 'button' as const,
    'aria-label': `${label(box)}. ${t(box.status === 'paid' ? 'monthPick.takeOut' : 'monthPick.pay')}`,
    onClick: (event: MouseEvent) => {
      event.stopPropagation();
      onPick?.(box);
    },
  });

  if (compact) {
    return (
      <ol
        className={styles.strip}
        aria-label={t('months.title', { year: formatPlain(year, digits) })}
      >
        {boxes.map((box) => {
          const cell = {
            className: styles.cell,
            'data-status': box.status,
            'data-selected': box.month === selected || undefined,
            title: label(box),
          };
          const number = <span aria-hidden="true">{formatPlain(box.month, digits)}</span>;
          return canPick(box) ? (
            <li key={box.month} className={styles.slot}>
              <button {...cell} {...pickProps(box)}>
                {number}
              </button>
            </li>
          ) : (
            <li key={box.month} {...cell} aria-label={label(box)}>
              {number}
            </li>
          );
        })}
      </ol>
    );
  }

  const amountText = (paid: number) => formatAmount(paid, FRACTION_DIGITS[currency], digits);

  return (
    <div className={styles.container}>
      <ol
        className={styles.grid}
        aria-label={t('months.title', { year: formatPlain(year, digits) })}
      >
        {boxes.map((box, index) => {
          const shape = {
            className: styles.box,
            'data-status': box.status,
            'data-selected': box.month === selected || undefined,
            'aria-current': box.month === selected || undefined,
            style: { '--index': index } as CSSProperties,
          };
          const content = (
            <>
              <span className={styles.number} aria-hidden="true">
                {formatPlain(box.month, digits)}
              </span>
              <span
                className={styles.amount}
                aria-hidden="true"
                style={fitted(box.paid > 0 ? amountText(box.paid) : '')}
              >
                {box.paid > 0 && <bdi dir="ltr">{amountText(box.paid)}</bdi>}
              </span>
              <span
                className={styles.word}
                aria-hidden="true"
                style={fitted(t(`months.status.${monthWord(box)}`))}
              >
                {t(`months.status.${monthWord(box)}`)}
              </span>
            </>
          );
          return canPick(box) ? (
            <li key={box.month} className={styles.slot}>
              <button {...shape} {...pickProps(box)}>
                {content}
              </button>
            </li>
          ) : (
            <li key={box.month} {...shape} aria-label={label(box)}>
              {content}
            </li>
          );
        })}
      </ol>
    </div>
  );
});

/** A short label in a month status colour, such as "Late" or "Late months: 3". */
export function StatusPill({ status, children }: { status: MonthStatus; children: ReactNode }) {
  return (
    <span className={styles.summary} data-status={status}>
      {children}
    </span>
  );
}

/** One word for a whole year (Late, Due, Paid…), in the matching colour. */
export function YearSummaryText({ summary }: { summary: YearSummary }) {
  const { t } = useTranslation();
  return <StatusPill status={SUMMARY_COLOR[summary]}>{t(`months.summary.${summary}`)}</StatusPill>;
}
