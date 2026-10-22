import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@shared/dates';
import type { BackupReminder } from '@shared/notifications';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { Notice } from '../../components/Notice';
import styles from './Notifications.module.css';

/**
 * The monthly backup reminder with its one-click Back up now, which uses the
 * saved folder (and asks for one the first time). Shown on the popup and the
 * Notifications page.
 */
export function BackupReminderBox({ reminder }: { reminder: BackupReminder }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const mounted = useMountedRef();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const backUp = async () => {
    setBusy(true);
    setResult(null);
    const answer = await callIpc('backup:now');
    if (!mounted.current) return;
    setBusy(false);
    const outcome = answer.ok ? answer.data : null;
    if (!outcome || !outcome.ok) {
      setResult({ tone: 'error', text: t(`backup.problems.${outcome?.reason ?? 'failed'}`) });
    } else if (outcome.done === 'saved') {
      setResult({ tone: 'success', text: t('backup.saved', { file: outcome.fileName }) });
    }
  };

  if (result?.tone === 'success') return <Notice tone="success">{result.text}</Notice>;
  return (
    <div className={styles.backup}>
      <div className={styles.what}>
        <strong>{t('notifications.backupDue')}</strong>
        <span className={styles.second}>
          {reminder.lastBackupOn
            ? t('backup.lastBackup', {
                date: formatDate(reminder.lastBackupOn, settings.digitStyle),
              })
            : t('backup.never')}
        </span>
        {result && <Notice tone={result.tone}>{result.text}</Notice>}
      </div>
      <BigButton variant="primary" onClick={() => void backUp()} disabled={busy}>
        {t('backup.now')}
      </BigButton>
    </div>
  );
}
