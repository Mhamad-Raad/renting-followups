import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { areaLabel, areaLines } from '@shared/areas';
import { dateStringFromLocal, formatDate } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { PART_SEPARATOR, reportFilterParts, reportTitle } from '@shared/reportText';
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

/** The widths of the figures row's columns (place, renter, currency, rent, received, still owed). */
const COLUMN_WIDTHS = ['27%', '23%', '8%', '14%', '14%', '14%'];
/** The months and notes rows span every column. */
const COLUMNS = COLUMN_WIDTHS.length;

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
 * The printed report (ARCHITECTURE.md sections 8.5 and 14): A4 upright, each
 * place as one group of lines (figures, months, notes at full width), the
 * header row repeated on every page, totals per currency at the bottom and
 * page numbers.
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

  // Named after the one place of the area page, else the chosen category, with its period.
  // Like the file name: the one place by its own record, even when its row is filtered out.
  const onlyArea =
    query.onlyIds?.length === 1
      ? report.state.data.candidates.find((area) => area.id === query.onlyIds?.[0])
      : undefined;
  const name = onlyArea ? areaLabel(onlyArea) : categoryName;
  const heading = reportTitle(query, name, digits);
  const title = t(heading.key, heading.values);

  return (
    <PrintFrame
      title={title}
      details={[
        filters,
        t('print.printedOn', { date: formatDate(dateStringFromLocal(new Date()), digits) }),
      ]}
    >
      <table className={`${styles.table} ${styles.upright}`}>
        <colgroup>
          {COLUMN_WIDTHS.map((width, index) => (
            <col key={index} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t('reports.columns.area')}</th>
            <th scope="col">{t('reports.columns.renter')}</th>
            <th scope="col">{t('areaForm.currency')}</th>
            <th scope="col">{t('reports.columns.rent')}</th>
            <th scope="col">{t('reports.columns.received')}</th>
            <th scope="col">{t('reports.columns.remaining')}</th>
          </tr>
        </thead>
        {/* One group per place, never split across pages: its figures, then its months, then its notes. */}
        {rows.map((row) => {
          const chosen =
            query.month === null ? null : row.boxes.find((box) => box.month === query.month);
          const lines = areaLines(row);
          return (
            <tbody key={row.id} className={styles.place}>
              <tr>
                <td>
                  <span className={styles.strong}>{lines.title}</span>
                  {lines.subline && (
                    <span className={styles.second}>
                      <bdi>{lines.subline}</bdi>
                    </span>
                  )}
                </td>
                <td>
                  {row.renterName ?? '—'}
                  {row.renterPhone && (
                    <span className={`${styles.second} ${styles.number}`}>
                      <PhoneText phone={row.renterPhone} />
                    </span>
                  )}
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
              </tr>
              <tr>
                <td colSpan={COLUMNS}>
                  <div className={styles.months}>
                    <span className={styles.strip}>
                      <MonthBoxes
                        boxes={row.boxes}
                        year={query.year}
                        compact
                        selected={query.month}
                      />
                    </span>
                    <span className={styles.strong}>
                      {chosen
                        ? t(`months.status.${monthWord(chosen)}`)
                        : t(`months.summary.${row.summary}`)}
                    </span>
                  </div>
                </td>
              </tr>
              {/* The notes get the whole width, so they are never squeezed (the business, 2026-11-01). */}
              {row.notes && (
                <tr>
                  <td colSpan={COLUMNS} className={styles.notes}>
                    <span className={styles.strong}>{t('area.notes')}: </span>
                    {/* Notes in another language keep their own direction, the label stays in place. */}
                    <bdi>{row.notes}</bdi>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
        <tfoot>
          {report.state.data.totals.map((total) => (
            <tr key={total.currency}>
              <th scope="row" colSpan={2}>
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
