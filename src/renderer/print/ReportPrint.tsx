import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { areaLabel, areaLines } from '@shared/areas';
import { dateStringFromLocal, formatDate } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { PART_SEPARATOR, reportFilterParts, reportTitle } from '@shared/reportText';
import { reportQuerySchema, type ReportQuery, type ReportRow } from '@shared/reports';
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

/** The share of the table's width each column gets; the notes have the most room of the text. */
const COLUMN_WIDTHS = ['13.5%', '14%', '12%', '4.5%', '6.5%', '7%', '7%', '21%', '15%'];

/**
 * The upright A4 page's writing area in mm (print.css: margins 14mm and 12mm),
 * less a little, so a full page never spills onto an empty one.
 */
const PAGE = { long: 268, short: 185 };
const PAGE_SPARE = 4;
const PX_PER_MM = 96 / 25.4;

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
 * The printed report (ARCHITECTURE.md sections 8.5 and 14): its table turned
 * sideways on upright A4 pages, the column names repeated on every page,
 * totals per currency at the end and page numbers.
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
  // The print page is ready once its pages are laid out (or there is nothing to lay out).
  const [laidOut, setLaidOut] = useState(false);
  const failed = report.state.status === 'error';
  usePrintReady(loaded && !preview && (laidOut || failed) ? !failed : null);
  if (report.state.status !== 'ready') return null;

  const { rows, totals } = report.state.data;
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
      {(heading) => (
        <SidewaysPages
          heading={heading}
          rows={rows}
          onLaidOut={() => setLaidOut(true)}
          table={(pageRows, last) => (
            <table className={styles.table}>
              <colgroup>
                {COLUMN_WIDTHS.map((width, index) => (
                  <col key={index} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">{t('reports.columns.area')}</th>
                  <th scope="col">{t('area.category')}</th>
                  <th scope="col">{t('reports.columns.renter')}</th>
                  <th scope="col">{t('areaForm.currency')}</th>
                  <th scope="col">{t('reports.columns.rent')}</th>
                  <th scope="col">{t('reports.columns.received')}</th>
                  <th scope="col">{t('reports.columns.remaining')}</th>
                  <th scope="col">
                    {t('months.title', { year: formatPlain(query.year, digits) })}
                  </th>
                  <th scope="col">{t('area.notes')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <PlaceRow key={row.id} row={row} query={query} />
                ))}
              </tbody>
              {last && (
                <tfoot>
                  {totals.map((total) => (
                    <tr key={total.currency}>
                      <th scope="row" colSpan={3}>
                        {t('reports.total', {
                          currency: t(`currency.${total.currency}`),
                          number: formatPlain(total.areas, digits),
                        })}
                      </th>
                      <td>{t(`currency.${total.currency}`)}</td>
                      <td className={styles.money}>
                        <MoneyText
                          amount={total.rent}
                          currency={total.currency}
                          withCurrency={false}
                        />
                      </td>
                      <td className={styles.money}>
                        <MoneyText
                          amount={total.received}
                          currency={total.currency}
                          withCurrency={false}
                        />
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
              )}
            </table>
          )}
          footer={
            <p className={styles.detail}>
              {t('reports.footer', {
                december: formatPlain(12, digits),
                november: formatPlain(11, digits),
              })}
            </p>
          }
        />
      )}
    </PrintFrame>
  );
}

/** One place's row: the columns of the printed report. */
function PlaceRow({ row, query }: { row: ReportRow; query: ReportQuery }) {
  const { t } = useTranslation();
  const chosen = query.month === null ? null : row.boxes.find((box) => box.month === query.month);
  const lines = areaLines(row);
  return (
    <tr>
      <td>
        <span className={styles.strong}>
          <bdi>{lines.title}</bdi>
        </span>
        {lines.subline && !lines.sublineIsCategory && (
          <span className={styles.second}>
            <bdi>{lines.subline}</bdi>
          </span>
        )}
      </td>
      <td>
        <bdi>{row.categoryName}</bdi>
      </td>
      <td>
        <bdi>{row.renterName ?? '—'}</bdi>
        {row.renterPhone && (
          <span className={`${styles.second} ${styles.number}`}>
            <PhoneText phone={row.renterPhone} />
          </span>
        )}
      </td>
      <td className={styles.strong}>
        <PerCurrency items={row.figures}>{(part) => t(`currency.${part.currency}`)}</PerCurrency>
      </td>
      <td className={styles.money}>
        <PerCurrency items={row.figures}>
          {(part) => <RentText price={part.rent} currency={part.currency} withCurrency={false} />}
        </PerCurrency>
      </td>
      <td className={styles.money}>
        <PerCurrency items={row.figures}>
          {(part) => (
            <MoneyText amount={part.received} currency={part.currency} withCurrency={false} />
          )}
        </PerCurrency>
      </td>
      <td className={styles.money}>
        <PerCurrency items={row.figures}>
          {(part) => (
            <MoneyText amount={part.remaining} currency={part.currency} withCurrency={false} />
          )}
        </PerCurrency>
      </td>
      <td className={styles.months}>
        <MonthBoxes boxes={row.boxes} year={query.year} compact selected={query.month} />
        <span className={styles.status}>
          {chosen ? t(`months.status.${monthWord(chosen)}`) : t(`months.summary.${row.summary}`)}
        </span>
      </td>
      <td className={styles.notes}>
        <bdi>{row.notes}</bdi>
      </td>
    </tr>
  );
}

interface SidewaysPagesProps<T> {
  heading: ReactNode;
  rows: readonly T[];
  table: (rows: readonly T[], last: boolean) => ReactNode;
  footer: ReactNode;
  onLaidOut: () => void;
}

/**
 * The table turned sideways on upright A4 pages, running along the long edge
 * (the business's picture, 2026-11-01). A turned page cannot flow by itself, so
 * the whole table is first measured at that width, out of sight, and shared
 * into pages; no row splits, and every page repeats the column names.
 */
function SidewaysPages<T>({ heading, rows, table, footer, onLaidOut }: SidewaysPagesProps<T>) {
  const measure = useRef<HTMLDivElement>(null);
  // Remembered with the rows they were worked out for: new rows are measured again.
  const [laidOut, setLaidOut] = useState<{ rows: readonly T[]; pages: (readonly T[])[] } | null>(
    null,
  );
  const pages = laidOut?.rows === rows ? laidOut.pages : null;
  const latestDone = useRef(onLaidOut);
  useEffect(() => {
    latestDone.current = onLaidOut;
  });

  useEffect(() => {
    const box = measure.current;
    if (!box) return;
    let cancelled = false;
    const layOut = () => {
      if (cancelled) return;
      const sheet = box.querySelector('table');
      const part = (name: string) =>
        box.querySelector<HTMLElement>(`[data-part='${name}']`)?.offsetHeight ?? 0;
      const heights = [...(sheet?.tBodies[0]?.rows ?? [])].map((row) => row.offsetHeight);
      const end = (sheet?.tFoot?.offsetHeight ?? 0) + part('footer');
      const columnNames = sheet?.tHead?.offsetHeight ?? 0;
      setLaidOut({ rows, pages: sharePages(rows, heights, part('heading'), columnNames, end) });
    };
    void document.fonts.ready.then(() => {
      layOut();
      if (!cancelled) latestDone.current();
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  return (
    <>
      {/* Out of sight, as wide as a turned page: the heights the pages are worked out from. */}
      {!pages && (
        <div ref={measure} className={styles.measure} aria-hidden="true">
          <div data-part="heading">{heading}</div>
          {table(rows, true)}
          <div data-part="footer">{footer}</div>
        </div>
      )}
      {pages?.map((pageRows, index) => {
        const last = index === pages.length - 1;
        return (
          <section key={index} className={styles.uprightPage}>
            <div className={styles.turned}>
              {index === 0 && heading}
              {table(pageRows, last)}
              {last && footer}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Shares rows into pages by height; the heading takes room on the first, the totals on the last. */
function sharePages<T>(
  rows: readonly T[],
  heights: readonly number[],
  heading: number,
  columnNames: number,
  end: number,
): (readonly T[])[] {
  // A little kept free: paper rounds heights differently from the screen.
  const room = (PAGE.short - PAGE_SPARE) * PX_PER_MM;
  const pages: T[][] = [[]];
  let used = heading + columnNames;
  rows.forEach((row, index) => {
    const height = heights[index] ?? 0;
    if (used + height > room && pages.at(-1)?.length) {
      pages.push([]);
      used = columnNames;
    }
    pages.at(-1)?.push(row);
    used += height;
  });
  if (used + end > room && rows.length > 0) pages.push([]);
  return pages;
}
