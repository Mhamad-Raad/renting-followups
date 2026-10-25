import { useTranslation } from 'react-i18next';
import type { ReportQuery } from '@shared/reports';
import { BigButton } from '../components/BigButton';
import { Notice } from '../components/Notice';
import styles from './ReportOutputButtons.module.css';
import { usePrint } from './usePrint';

interface ReportOutputButtonsProps {
  query: ReportQuery;
  /** The print button's words, for example "Print selected"; "Print" by default. */
  printLabel?: string;
  /** False leaves out the direct Print button (the area page offers only PDF and Excel). */
  withPrint?: boolean;
}

/** Print, Export to PDF and Export to Excel for one report, with the result in plain words. */
export function ReportOutputButtons({
  query,
  printLabel,
  withPrint = true,
}: ReportOutputButtonsProps) {
  const { t } = useTranslation();
  const { run, busy, message } = usePrint();
  return (
    <div className={styles.stack}>
      <div className={styles.buttons}>
        {withPrint && (
          <BigButton
            icon="reports"
            disabled={busy}
            onClick={() => void run({ kind: 'report', query, output: 'printer' })}
          >
            {printLabel ?? t('print.actions.print')}
          </BigButton>
        )}
        <BigButton
          disabled={busy}
          onClick={() => void run({ kind: 'report', query, output: 'pdf' })}
        >
          {t('print.actions.pdf')}
        </BigButton>
        <BigButton disabled={busy} onClick={() => void run({ kind: 'excel', query })}>
          {t('print.actions.excel')}
        </BigButton>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
