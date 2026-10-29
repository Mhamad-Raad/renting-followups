import { useTranslation } from 'react-i18next';
import { areaLabel, hasOwnName } from '@shared/areas';
import { formatPlain } from '@shared/formatNumber';
import type { ReportRow, ReportTotal } from '@shared/reports';
import { useSettings } from '../../app/SettingsContext';
import { CategoryDot } from '../../components/CategoryDot';
import { CurrencyTag } from '../../components/CurrencyTag';
import { EmptyState } from '../../components/EmptyState';
import { MoneyText } from '../../components/MoneyText';
import { PerCurrency } from '../../components/PerCurrency';
import { MonthBoxes, monthWord, StatusPill, YearSummaryText } from '../../components/MonthBoxes';
import { PhoneText } from '../../components/PhoneText';
import { RentText } from '../areas/RentText';
import styles from './ReportsPage.module.css';

interface ReportTableProps {
  rows: readonly ReportRow[];
  year: number;
  month: number | null;
}

/** One slim row per area, with its money in separate columns like the Areas list. */
export function ReportTable({ rows, year, month }: ReportTableProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  if (rows.length === 0) return <EmptyState title={t('reports.empty')} />;
  return (
    <div className={styles.tableFrame}>
      <table className={styles.table}>
        <caption className={styles.caption}>{t('reports.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('reports.columns.area')}</th>
            <th scope="col">{t('reports.columns.renter')}</th>
            <th scope="col">{t('areaForm.currency')}</th>
            <th scope="col" className={styles.moneyCell}>
              {t('reports.columns.rent')}
            </th>
            <th scope="col" className={styles.moneyCell}>
              {t('reports.columns.received')}
            </th>
            <th scope="col" className={styles.moneyCell}>
              {t('reports.columns.remaining')}
            </th>
            <th scope="col">
              {t('months.title', { year: formatPlain(year, settings.digitStyle) })}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ReportTableRow key={row.id} row={row} year={year} month={month} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The totals first: one slim card per currency with its rent, received and still owed. */
export function ReportTotals({ totals }: { totals: readonly ReportTotal[] }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  if (totals.length === 0) return null;
  return (
    <section className={styles.totals} aria-label={t('reports.totals')}>
      {totals.map((total) => (
        <dl key={total.currency} className={styles.totalsCard}>
          <div className={styles.totalsName}>
            <dt>{t(`currency.${total.currency}`)}</dt>
            <dd>
              {t('reports.areasCount', { number: formatPlain(total.areas, settings.digitStyle) })}
            </dd>
          </div>
          <div>
            <dt>{t('reports.columns.rent')}</dt>
            <dd>
              <MoneyText amount={total.rent} currency={total.currency} />
            </dd>
          </div>
          <div>
            <dt>{t('reports.columns.received')}</dt>
            <dd>
              <MoneyText amount={total.received} currency={total.currency} />
            </dd>
          </div>
          <div data-owed={total.remaining > 0 || undefined}>
            <dt>{t('reports.columns.remaining')}</dt>
            <dd>
              <MoneyText amount={total.remaining} currency={total.currency} />
            </dd>
          </div>
        </dl>
      ))}
    </section>
  );
}

// Not memoized: every report arrives as new objects, and 200 rows draw in well under a second.
function ReportTableRow({
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
        <span className={styles.name}>
          {!hasOwnName(row) && <CategoryDot color={row.categoryColor} />}
          {areaLabel(row)}
        </span>
        {hasOwnName(row) && (
          <span className={`${styles.second} ${styles.category}`}>
            <CategoryDot color={row.categoryColor} />
            {row.categoryName}
          </span>
        )}
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
        <PerCurrency items={row.figures}>
          {(part) => <CurrencyTag currency={part.currency} />}
        </PerCurrency>
      </td>
      <td className={styles.moneyCell}>
        <PerCurrency items={row.figures}>
          {(part) => <RentText price={part.rent} currency={part.currency} withCurrency={false} />}
        </PerCurrency>
      </td>
      <td className={styles.moneyCell}>
        <PerCurrency items={row.figures}>
          {(part) => (
            <MoneyText amount={part.received} currency={part.currency} withCurrency={false} />
          )}
        </PerCurrency>
      </td>
      <td
        className={styles.moneyCell}
        data-owed={row.figures.some((part) => part.remaining > 0) || undefined}
      >
        <PerCurrency items={row.figures}>
          {(part) => (
            <MoneyText amount={part.remaining} currency={part.currency} withCurrency={false} />
          )}
        </PerCurrency>
      </td>
      <td>
        <div className={styles.year}>
          <MonthBoxes boxes={row.boxes} year={year} compact selected={month} />
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
}
