import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPlain } from '@shared/formatNumber';
import { DEFAULT_REPORT_FILTERS, type ReportFilters } from '@shared/reports';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { LoadError } from '../../components/LoadError';
import { PageHeader } from '../../components/PageHeader';
import { ReportOutputButtons } from '../../print/ReportOutputButtons';
import { AreaPicker } from './AreaPicker';
import { ReportFiltersBar } from './ReportFiltersBar';
import { ReportTable, ReportTotals } from './ReportTable';
import styles from './ReportsPage.module.css';

/** Reports: the totals per currency first, then the filters, then one slim row per area. */
export function ReportsPage() {
  const { t } = useTranslation();
  const lastFilters = useIpcQuery('reports:lastFilters');
  const header = <PageHeader title={t('pages.reports.title')} />;
  if (lastFilters.state.status === 'loading') return header;
  return (
    <>
      {header}
      <ReportView
        initialFilters={lastFilters.state.status === 'ready' ? lastFilters.state.data : undefined}
      />
    </>
  );
}

function ReportView({ initialFilters }: { initialFilters: ReportFilters | undefined }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  // The year always starts at the current one; the other filters are remembered.
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [filters, setFilters] = useState<ReportFilters>(initialFilters ?? DEFAULT_REPORT_FILTERS);
  const [excludedIds, setExcludedIds] = useState<readonly number[]>([]);
  const categories = useIpcQuery('categories:list');
  const query = useMemo(
    () => ({ year, ...filters, excludedIds: [...excludedIds], onlyIds: null }),
    [year, filters, excludedIds],
  );
  const report = useIpcQuery('reports:build', query);

  // Saved only when the owner changes a filter, so opening the page never overwrites them.
  const changeFilters = (change: Partial<ReportFilters>) => {
    const next = { ...filters, ...change };
    setFilters(next);
    void callIpc('reports:rememberFilters', next);
  };

  const rows = report.state.status === 'ready' ? report.state.data.rows : [];
  const candidates = report.state.status === 'ready' ? report.state.data.candidates : [];

  return (
    <div className={styles.stack}>
      {/* The totals first: what the owner looks for, before any row. */}
      {report.state.status === 'ready' && <ReportTotals totals={report.state.data.totals} />}
      <div className={styles.controls}>
        <ReportFiltersBar
          year={year}
          filters={filters}
          categories={categories.state.status === 'ready' ? categories.state.data : []}
          onYear={setYear}
          onFilters={changeFilters}
        />
        {report.state.status === 'ready' && (
          <div className={styles.toolbar}>
            <AreaPicker
              candidates={candidates}
              excludedIds={excludedIds}
              onChange={setExcludedIds}
            />
            {/* No direct Print here (owner's decision): the PDF is printed when paper is needed. */}
            {rows.length > 0 && <ReportOutputButtons query={query} withPrint={false} />}
          </div>
        )}
      </div>
      {report.state.status === 'error' && <LoadError onRetry={report.reload} />}
      {report.state.status === 'ready' && (
        <>
          <ReportTable rows={rows} year={year} month={filters.month} />
          <p className={styles.footer}>
            {t('reports.footer', {
              december: formatPlain(12, settings.digitStyle),
              november: formatPlain(11, settings.digitStyle),
            })}
          </p>
        </>
      )}
    </div>
  );
}
