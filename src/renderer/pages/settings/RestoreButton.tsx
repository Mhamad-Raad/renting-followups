import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackupInfo } from '@shared/backup';
import { formatDate } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Notice, type NoticeMessage } from '../../components/Notice';
import styles from './SettingsPage.module.css';

/**
 * Restore from backup (ARCHITECTURE.md section 13): pick a file, see what it
 * holds, confirm, and the app restarts with it. The main process checks the
 * file and keeps a safety copy of the current data; nothing changes before
 * the owner confirms. Used in Settings and on the damaged-data screen.
 */
export function RestoreButton({ primary = false }: { primary?: boolean }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const mounted = useMountedRef();
  const digits = settings.digitStyle;
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<BackupInfo | null>(null);
  const [message, setMessage] = useState<NoticeMessage | null>(null);

  const choose = async () => {
    setBusy(true);
    setMessage(null);
    const result = await callIpc('restore:choose');
    if (!mounted.current) return;
    setBusy(false);
    const choice = result.ok ? result.data : null;
    if (!choice || !choice.ok) {
      setMessage({ tone: 'error', text: t(`backup.refused.${choice?.reason ?? 'failed'}`) });
    } else if (choice.done === 'checked') {
      setChecked(choice.info);
    }
  };

  const confirm = async () => {
    setChecked(null);
    setBusy(true);
    const result = await callIpc('restore:apply');
    if (!mounted.current) return;
    if (result.ok && result.data.ok) {
      // The app closes and opens again in a moment; the button stays disabled until then.
      setMessage({ tone: 'success', text: t('backup.restarting') });
    } else {
      setBusy(false);
      setMessage({ tone: 'error', text: t('backup.refused.failed') });
    }
  };

  return (
    <div className={styles.column}>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className={styles.buttonRow}>
        <BigButton
          variant={primary ? 'primary' : 'secondary'}
          onClick={() => void choose()}
          disabled={busy}
        >
          {t('backup.restore')}
        </BigButton>
      </div>
      <ConfirmDialog
        open={checked !== null}
        title={t('backup.confirmTitle')}
        confirmLabel={t('backup.confirmRestore')}
        tone="danger"
        focusCancel
        onConfirm={() => void confirm()}
        onCancel={() => setChecked(null)}
      >
        {checked && (
          <>
            <p>{t('backup.madeOn', { date: formatDate(checked.madeOn, digits) })}</p>
            <p>{t('backup.areasInBackup', { number: formatPlain(checked.areas, digits) })}</p>
            <p>{t('backup.paymentsInBackup', { number: formatPlain(checked.receipts, digits) })}</p>
            <Notice tone="warning">{t('backup.replaceWarning')}</Notice>
            <p>{t('backup.passwordNote')}</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
