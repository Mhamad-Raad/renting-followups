import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { areaLabel, hasOwnName } from '@shared/areas';
import { dateStringFromLocal, formatDate } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { PART_SEPARATOR, reportFilterParts } from '@shared/reportText';
import { reportQuerySchema, type ReportQuery } from '@shared/reports';
import { useIpcQuery } from '../app/ipc';
import { useSettings } from '../app/SettingsContext';
import { MoneyText } from '../components/MoneyText';
import { PerCurrency } from '../components/PerCurrency';
import { MonthBoxes, monthWord } from '../components/MonthBoxes';
import { PhoneText } from '../components/PhoneText';
import { RentText } from '../pages/areas/RentText';
import styles from './print.module.css';
import { PrintFrame } from './PrintFrame';
import { usePrintReady } from './printPage';

/** The query in the address, checked like every other input; null when it is not valid. */
function parseQuery(raw: string | null): ReportQuery | null {
  if (raw === null) return null;
  try {
    const parsed = reportQuerySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The printed report (ARCHITECTURE.md sections 8.5 and 14): A4 landscape,
 * the separate columns of the spec, the header row repeated on every page,
 * totals per currency at the bottom and page numbers.
 */
export function ReportPrint() {
  const [params] = useSearchParams();
  const query = useMemo(() => parseQuery(params.get('q')), [params]);
  if (!query) return <ReportNotReadable />;
  return <ReportPaper query={query} />;
}

function ReportNotReadable() {
  usePrintReady(false);
  return null;
}

function ReportPaper({ query }: { query: ReportQuery }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  const report = useIpcQuery('reports:build', query);
  const categories = useIpcQuery('categories:list');
  const loaded = report.state.status !== 'loading' && categories.state.status !== 'loading';
  usePrintReady(loaded ? report.state.status === 'ready' : null);
  if (report.state.status !== 'ready') return null;

  const { rows } = report.state.data;
  const categoryName =
    categories.state.status === 'ready'
      ? (categories.state.data.find((category) => category.id === query.categoryId)?.name ?? null)
      : null;
  const filters = reportFilterParts(query, categoryName, digits)
    .map(
      (part) =>
        `${t(part.labelKey)}: ${'text' in part.value ? part.value.text : t(part.value.key)}`,
    )
    .join(PART_SEPARATOR);

  return (
    <PrintFrame
      landscape
      title={t('print.reportTitle')}
      details={[
        filters,
        t('print.printedOn', { date: formatDate(dateStringFromLocal(new Date()), digits) }),
      ]}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('reports.columns.area')}</th>
            <th scope="col">{t('area.category')}</th>
            <th scope="col">{t('reports.columns.renter')}</th>
            <th scope="col">{t('area.phone')}</th>
            <th scope="col">{t('areaForm.currency')}</th>
            <th scope="col">{t('reports.columns.rent')}</th>
            <th scope="col">{t('reports.columns.received')}</th>
            <th scope="col">{t('reports.columns.remaining')}</th>
            <th scope="col">{t('months.title', { year: formatPlain(query.year, digits) })}</th>
            <th scope="col">{t('area.notes')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const chosen =
              query.month === null ? null : row.boxes.find((box) => box.month === query.month);
            return (
              <tr key={row.id}>
                <td className={styles.strong}>{areaLabel(row)}</td>
                {/* Already the label when the place has no name of its own. */}
                <td>{hasOwnName(row) ? row.categoryName : ''}</td>
                <td>{row.renterName ?? '—'}</td>
                <td className={styles.number}>
                  {row.renterPhone && <PhoneText phone={row.renterPhone} />}
                </td>
                <td className={styles.strong}>
                  <PerCurrency items={row.figures}>
                    {(part) => t(`currency.${part.currency}`)}
                  </PerCurrency>
                </td>
                <td className={styles.money}>
                  <PerCurrency items={row.figures}>
                    {(part) => (
                      <RentText price={part.rent} currency={part.currency} withCurrency={false} />
                    )}
                  </PerCurrency>
                </td>
                <td className={styles.money}>
                  <PerCurrency items={row.figures}>
                    {(part) => (
                      <MoneyText
                        amount={part.received}
                        currency={part.currency}
                        withCurrency={false}
                      />
                    )}
                  </PerCurrency>
                </td>
                <td className={styles.money}>
                  <PerCurrency items={row.figures}>
                    {(part) => (
                      <MoneyText
                        amount={part.remaining}
                        currency={part.currency}
                        withCurrency={false}
                      />
                    )}
                  </PerCurrency>
                </td>
                <td>
                  <MonthBoxes boxes={row.boxes} year={query.year} compact selected={query.month} />
                  <span className={styles.status}>
                    {chosen
                      ? t(`months.status.${monthWord(chosen)}`)
                      : t(`months.summary.${row.summary}`)}
                  </span>
                </td>
                <td className={styles.notes} dir="auto">
                  {row.notes}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {report.state.data.totals.map((total) => (
            <tr key={total.currency}>
              <th scope="row" colSpan={4}>
                {t('reports.total', {
                  currency: t(`currency.${total.currency}`),
                  number: formatPlain(total.areas, digits),
                })}
              </th>
              <td>{t(`currency.${total.currency}`)}</td>
              <td className={styles.money}>
                <MoneyText amount={total.rent} currency={total.currency} withCurrency={false} />
              </td>
              <td className={styles.money}>
                <MoneyText amount={total.received} currency={total.currency} withCurrency={false} />
              </td>
              <td className={styles.money}>
                <MoneyText
                  amount={total.remaining}
                  currency={total.currency}
                  withCurrency={false}
                />
              </td>
              <td colSpan={2} />
            </tr>
          ))}
        </tfoot>
      </table>
      <p className={styles.detail}>
        {t('reports.footer', {
          december: formatPlain(12, digits),
          november: formatPlain(11, digits),
        })}
      </p>
    </PrintFrame>
  );
}
