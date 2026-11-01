import { useTranslation } from 'react-i18next';
import type { ReportQuery } from '@shared/reports';
import { BigButton } from '../components/BigButton';
import { Dialog, DialogActions } from '../components/Dialog';
import { Notice } from '../components/Notice';
import styles from './ReportPreviewDialog.module.css';
import { ReportPaper } from './ReportPrint';
import { usePrint } from './usePrint';

interface ReportPreviewDialogProps {
  query: ReportQuery;
  open: boolean;
  onClose: () => void;
}

/**
 * The report in a pop-up, as the PDF will be (the same page the PDF is made
 * from), with Save as PDF and Print (the business, 2026-11-01).
 */
export function ReportPreviewDialog({ query, open, onClose }: ReportPreviewDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} title={t('print.preview.title')} onClose={onClose} size="large">
      {open && <PreviewBody query={query} onClose={onClose} />}
    </Dialog>
  );
}

/** Only while open, so a closed pop-up builds no report. */
function PreviewBody({ query, onClose }: { query: ReportQuery; onClose: () => void }) {
  const { t } = useTranslation();
  const { run, busy, message } = usePrint();
  return (
    <>
      <div className={styles.desk}>
        {/* Light like the printed page, in dark mode too. */}
        <div className={styles.sheet} data-theme="light">
          <ReportPaper query={query} preview />
        </div>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <DialogActions>
        <BigButton
          variant="primary"
          icon="download"
          disabled={busy}
          onClick={() => void run({ kind: 'report', query, output: 'pdf' })}
        >
          {t('print.actions.savePdf')}
        </BigButton>
        <BigButton
          icon="reports"
          disabled={busy}
          onClick={() => void run({ kind: 'report', query, output: 'printer' })}
        >
          {t('print.actions.print')}
        </BigButton>
        <BigButton onClick={onClose}>{t('common.close')}</BigButton>
      </DialogActions>
    </>
  );
}
