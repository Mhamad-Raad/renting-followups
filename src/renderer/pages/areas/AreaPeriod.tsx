import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import { formatPlain } from '@shared/formatNumber';
import type { MonthBox } from '@shared/months';
import type { Receipt } from '@shared/payments';
import { useSettings } from '../../app/SettingsContext';
import { FigureCards } from '../../components/FigureCards';
import { MoneyText } from '../../components/MoneyText';
import { MonthBoxes } from '../../components/MonthBoxes';
import { LoadError } from '../../components/LoadError';
import styles from './AreaPage.module.css';
import { ReportOutputButtons } from '../../print/ReportOutputButtons';
import { areaYears, PeriodFilter } from './PeriodFilter';
import { ReceiptList } from './ReceiptList';
import { RentText } from './RentText';
import type { useAreaPeriod } from './useAreaPeriod';

interface AreaPeriodProps {
  area: AreaDetails;
  period: ReturnType<typeof useAreaPeriod>;
  currentYear: number;
  onEdit: (receipt: Receipt) => void;
  onCancel: (receipt: Receipt) => void;
  onSavePdf: (receipt: Receipt) => void;
  saving: boolean;
  /** A click on a month box: mark it paid, or not paid (ARCHITECTURE.md section 7.4). */
  onPickMonth: (box: MonthBox) => void;
}

/** The chosen year (or month): the filter, the four figures, the 12 boxes and the receipts. */
export function AreaPeriod({
  area,
  period,
  currentYear,
  onEdit,
  onCancel,
  onSavePdf,
  saving,
  onPickMonth,
}: AreaPeriodProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { year, month, months, receipts } = period;
  const money = (amount: number) => <MoneyText amount={amount} currency={area.currency} />;

  return (
    <>
      <PeriodFilter
        years={areaYears(area.prices[0]?.year, currentYear)}
        year={year}
        month={month}
        onYear={period.setYear}
        onMonth={period.setMonth}
      />
      {months.state.status === 'error' && <LoadError onRetry={months.reload} />}
      {months.state.status === 'ready' && months.state.data && (
        <>
          <FigureCards
            figures={[
              {
                label: t('area.figures.rent'),
                value: <RentText price={months.state.data.figures.rent} currency={area.currency} />,
              },
              {
                label: t(month === null ? 'area.figures.expected' : 'area.figures.expectedMonth'),
                value: money(months.state.data.figures.expected),
              },
              {
                label: t('area.figures.received'),
                value: money(months.state.data.figures.received),
              },
              {
                label: t('area.figures.remaining'),
                value: money(months.state.data.figures.remaining),
                tone: months.state.data.figures.remaining > 0 ? 'warning' : 'normal',
              },
            ]}
          />
          <section className={styles.card}>
            <h2 className={styles.heading}>
              {t('months.title', { year: formatPlain(year, settings.digitStyle) })}
            </h2>
            <MonthBoxes
              boxes={months.state.data.boxes}
              year={year}
              currency={area.currency}
              selected={month}
              onPick={onPickMonth}
            />
            <p className={styles.footnote}>{t('area.figures.remainingHint')}</p>
          </section>
        </>
      )}

      <ReportOutputButtons
        withPrint={false}
        query={{
          year,
          month,
          categoryId: null,
          currency: null,
          status: 'all',
          excludedIds: [],
          onlyIds: [area.id],
        }}
      />

      <section className={styles.card}>
        <h2 className={styles.heading}>{t('receipts.title')}</h2>
        {receipts.state.status === 'error' && <LoadError onRetry={receipts.reload} />}
        {receipts.state.status === 'ready' && (
          <ReceiptList
            receipts={receipts.state.data}
            onEdit={onEdit}
            onCancel={onCancel}
            onSavePdf={onSavePdf}
            saving={saving}
          />
        )}
      </section>
    </>
  );
}
