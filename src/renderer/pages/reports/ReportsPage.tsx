import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPlain } from '@shared/formatNumber';
import type { ReportFilters } from '@shared/reports';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { AreaPicker } from './AreaPicker';
import { ReportFiltersBar } from './ReportFiltersBar';
import { ReportTable } from './ReportTable';
import styles from './ReportsPage.module.css';

/** Reports: filters at the top, then one row per area with totals per currency. */
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
  const [filters, setFilters] = useState<ReportFilters>(
    initialFilters ?? { month: null, categoryId: null, currency: null, status: 'all' },
  );
  const [excludedIds, setExcludedIds] = useState<readonly number[]>([]);
  const categories = useIpcQuery('categories:list');
  const report = useIpcQuery('reports:build', { year, ...filters, excludedIds: [...excludedIds] });

  useEffect(() => {
    void callIpc('reports:rememberFilters', filters);
  }, [filters]);

  const collator = useMemo(() => new Intl.Collator(settings.language), [settings.language]);
  const rows = useMemo(
    () =>
      report.state.status === 'ready'
        ? [...report.state.data.rows].sort((a, b) => collator.compare(a.name, b.name))
        : [],
    [report.state, collator],
  );
  const candidates = useMemo(
    () =>
      report.state.status === 'ready'
        ? [...report.state.data.candidates].sort((a, b) => collator.compare(a.name, b.name))
        : [],
    [report.state, collator],
  );

  return (
    <div className={styles.stack}>
      <ReportFiltersBar
        year={year}
        filters={filters}
        categories={categories.state.status === 'ready' ? categories.state.data : []}
        onYear={setYear}
        onFilters={(change) => setFilters((current) => ({ ...current, ...change }))}
      />
      {report.state.status === 'error' && <Notice tone="error">{t('errors.unexpected')}</Notice>}
      {report.state.status === 'ready' && (
        <>
          <AreaPicker candidates={candidates} excludedIds={excludedIds} onChange={setExcludedIds} />
          <ReportTable
            rows={rows}
            totals={report.state.data.totals}
            year={year}
            month={filters.month}
          />
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
