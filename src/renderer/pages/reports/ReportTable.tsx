import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPlain } from '@shared/formatNumber';
import type { ReportRow, ReportTotal } from '@shared/reports';
import { useSettings } from '../../app/SettingsContext';
import { CategoryDot } from '../../components/CategoryDot';
import { EmptyState } from '../../components/EmptyState';
import { MoneyText } from '../../components/MoneyText';
import { MonthBoxes, monthWord, StatusPill, YearSummaryText } from '../../components/MonthBoxes';
import { PhoneText } from '../../components/PhoneText';
import { RentText } from '../areas/RentText';
import styles from './ReportsPage.module.css';

interface ReportTableProps {
  rows: readonly ReportRow[];
  totals: readonly ReportTotal[];
  year: number;
  month: number | null;
}

/** One row per area, then one total row per currency. */
export function ReportTable({ rows, totals, year, month }: ReportTableProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  if (rows.length === 0) return <EmptyState title={t('reports.empty')} />;
  return (
    <div className={styles.tableFrame}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('reports.columns.area')}</th>
            <th>{t('reports.columns.renter')}</th>
            <th>{t('reports.columns.money')}</th>
            <th>{t('months.title', { year: formatPlain(year, settings.digitStyle) })}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ReportTableRow key={row.id} row={row} year={year} month={month} />
          ))}
        </tbody>
        <tfoot>
          {totals.map((total) => (
            <tr key={total.currency}>
              <th scope="row" colSpan={2}>
                {t('reports.total', {
                  currency: t(`currency.${total.currency}`),
                  number: formatPlain(total.areas, settings.digitStyle),
                })}
              </th>
              <td>
                <MoneyLines
                  currency={total.currency}
                  rent={<MoneyText amount={total.rent} currency={total.currency} />}
                  received={total.received}
                  remaining={total.remaining}
                />
              </td>
              <td />
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

/** Rent, received and still owed, each on its own labelled line, so the table fits the window. */
function MoneyLines({
  currency,
  rent,
  received,
  remaining,
}: {
  currency: ReportRow['currency'];
  rent: ReactNode;
  received: number;
  remaining: number;
}) {
  const { t } = useTranslation();
  return (
    <dl className={styles.money}>
      <dt>{t('reports.columns.rent')}</dt>
      <dd>{rent}</dd>
      <dt>{t('reports.columns.received')}</dt>
      <dd>
        <MoneyText amount={received} currency={currency} />
      </dd>
      <dt>{t('reports.columns.remaining')}</dt>
      <dd data-owed={remaining > 0 || undefined}>
        <MoneyText amount={remaining} currency={currency} />
      </dd>
    </dl>
  );
}

/** Memoized: changing a filter re-renders only rows whose data changed. */
const ReportTableRow = memo(function ReportTableRow({
  row,
  year,
  month,
}: {
  row: ReportRow;
  year: number;
  month: number | null;
}) {
  const { t } = useTranslation();
  const chosen = month === null ? null : row.boxes.find((box) => box.month === month);
  return (
    <tr>
      <td>
        <span className={styles.name}>{row.name}</span>
        <span className={`${styles.second} ${styles.category}`}>
          <CategoryDot color={row.categoryColor} />
          {row.categoryName}
        </span>
        {row.notes && (
          <span className={styles.notes} title={row.notes} dir="auto">
            {row.notes}
          </span>
        )}
      </td>
      <td>
        {row.renterName ?? <span className={styles.muted}>{t('areas.noRenter')}</span>}
        {row.renterPhone && (
          <span className={`${styles.second} ${styles.number}`}>
            <PhoneText phone={row.renterPhone} />
          </span>
        )}
      </td>
      <td>
        <MoneyLines
          currency={row.currency}
          rent={<RentText price={row.figures.rent} currency={row.currency} />}
          received={row.figures.received}
          remaining={row.figures.remaining}
        />
      </td>
      <td>
        <div className={styles.year}>
          <MonthBoxes
            boxes={row.boxes}
            year={year}
            currency={row.currency}
            compact
            selected={month}
          />
          {chosen ? (
            <StatusPill status={chosen.status}>
              {t(`months.status.${monthWord(chosen)}`)}
            </StatusPill>
          ) : (
            <YearSummaryText summary={row.summary} />
          )}
        </div>
      </td>
    </tr>
  );
});
