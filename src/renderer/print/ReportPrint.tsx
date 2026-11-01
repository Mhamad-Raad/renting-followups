import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { areaLabel } from '@shared/areas';
import { dateStringFromLocal, formatDate } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { PART_SEPARATOR, reportFilterParts, reportTitle } from '@shared/reportText';
import type { CurrencyFigures } from '@shared/months';
import {
  reportQuerySchema,
  type ReportQuery,
  type ReportRow,
  type ReportTotal,
} from '@shared/reports';
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

/** Places side by side in one table; more would squeeze their columns too far. */
const PLACES_PER_TABLE = 3;
/** The column of field names down the side, then the share of each place, in percent. */
const LABEL_WIDTH = 19;
const PLACE_WIDTH = (100 - LABEL_WIDTH) / PLACES_PER_TABLE;

/** Splits the places into the groups that share one table. */
function inTables<T>(rows: readonly T[]): T[][] {
  const tables: T[][] = [];
  for (let start = 0; start < rows.length; start += PLACES_PER_TABLE) {
    tables.push(rows.slice(start, start + PLACES_PER_TABLE));
  }
  return tables;
}

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
 * The printed report (ARCHITECTURE.md sections 8.5 and 14): A4 upright, turned
 * 90 degrees (field names down the side, each place a column), the totals per
 * currency at the end and page numbers.
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

/**
 * The report itself. The print page tells the main process when it is ready;
 * in the preview pop-up (`preview`) it is only shown.
 */
export function ReportPaper({ query, preview = false }: { query: ReportQuery; preview?: boolean }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  const report = useIpcQuery('reports:build', query);
  const categories = useIpcQuery('categories:list');
  const loaded = report.state.status !== 'loading' && categories.state.status !== 'loading';
  usePrintReady(loaded && !preview ? report.state.status === 'ready' : null);
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
      {inTables(rows).map((places) => (
        <PlacesTable key={places[0]?.id} places={places} year={query.year} month={query.month} />
      ))}
      <TotalsTable totals={report.state.data.totals} />
      <p className={styles.detail}>
        {t('reports.footer', {
          december: formatPlain(12, digits),
          november: formatPlain(11, digits),
        })}
      </p>
    </PrintFrame>
  );
}

interface PlacesTableProps {
  places: readonly ReportRow[];
  year: number;
  month: number | null;
}

/**
 * Up to three places side by side, turned 90 degrees: the field names run down
 * the side and each place is a column (the business, 2026-11-01). One table
 * never splits across pages; a short last one keeps the same column widths.
 */
function PlacesTable({ places, year, month }: PlacesTableProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const field = (label: string, cell: (place: ReportRow) => ReactNode, className?: string) => (
    <tr>
      <th scope="row">{label}</th>
      {places.map((place) => (
        <td key={place.id} className={className}>
          {cell(place)}
        </td>
      ))}
    </tr>
  );
  const money = (cell: (part: CurrencyFigures) => ReactNode) => (place: ReportRow) => (
    <PerCurrency items={place.figures}>{cell}</PerCurrency>
  );
  const status = (place: ReportRow) => {
    const chosen = month === null ? null : place.boxes.find((box) => box.month === month);
    return chosen ? t(`months.status.${monthWord(chosen)}`) : t(`months.summary.${place.summary}`);
  };
  return (
    <table
      className={`${styles.table} ${styles.turned}`}
      style={{ width: `${LABEL_WIDTH + places.length * PLACE_WIDTH}%` }}
    >
      <colgroup>
        <col
          style={{ width: `${(LABEL_WIDTH * 100) / (LABEL_WIDTH + places.length * PLACE_WIDTH)}%` }}
        />
        {places.map((place) => (
          <col key={place.id} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{t('reports.columns.area')}</th>
          {places.map((place) => (
            <th key={place.id} scope="col">
              <bdi>{areaLabel(place)}</bdi>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {field(t('area.address'), (place) => (
          <bdi>{place.address.trim() || '—'}</bdi>
        ))}
        {field(t('area.category'), (place) => (
          <bdi>{place.categoryName}</bdi>
        ))}
        {field(t('reports.columns.renter'), (place) => (
          <bdi>{place.renterName ?? '—'}</bdi>
        ))}
        {field(
          t('area.phone'),
          (place) => (place.renterPhone ? <PhoneText phone={place.renterPhone} /> : '—'),
          styles.number,
        )}
        {field(
          t('areaForm.currency'),
          money((part) => t(`currency.${part.currency}`)),
          styles.strong,
        )}
        {field(
          t('reports.columns.rent'),
          money((part) => (
            <RentText price={part.rent} currency={part.currency} withCurrency={false} />
          )),
          styles.money,
        )}
        {field(
          t('reports.columns.received'),
          money((part) => (
            <MoneyText amount={part.received} currency={part.currency} withCurrency={false} />
          )),
          styles.money,
        )}
        {field(
          t('reports.columns.remaining'),
          money((part) => (
            <MoneyText amount={part.remaining} currency={part.currency} withCurrency={false} />
          )),
          styles.money,
        )}
        {field(
          t('months.title', { year: formatPlain(year, settings.digitStyle) }),
          (place) => (
            <>
              <MonthBoxes boxes={place.boxes} year={year} compact selected={month} />
              <span className={styles.status}>{status(place)}</span>
            </>
          ),
          styles.months,
        )}
        {field(
          t('area.notes'),
          (place) => (
            <bdi>{place.notes || '—'}</bdi>
          ),
          styles.notes,
        )}
      </tbody>
    </table>
  );
}

/** The totals, turned like the places: one column per currency, never added together. */
function TotalsTable({ totals }: { totals: readonly ReportTotal[] }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  if (totals.length === 0) return null;
  const amount = (label: string, value: (total: ReportTotal) => number) => (
    <tr>
      <th scope="row">{label}</th>
      {totals.map((total) => (
        <td key={total.currency} className={styles.money}>
          <MoneyText amount={value(total)} currency={total.currency} withCurrency={false} />
        </td>
      ))}
    </tr>
  );
  return (
    <table className={`${styles.table} ${styles.turned}`}>
      <thead>
        <tr>
          <th scope="col" />
          {totals.map((total) => (
            <th key={total.currency} scope="col">
              {t('reports.total', {
                currency: t(`currency.${total.currency}`),
                number: formatPlain(total.areas, settings.digitStyle),
              })}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {amount(t('reports.columns.rent'), (total) => total.rent)}
        {amount(t('reports.columns.received'), (total) => total.received)}
        {amount(t('reports.columns.remaining'), (total) => total.remaining)}
      </tbody>
    </table>
  );
}
