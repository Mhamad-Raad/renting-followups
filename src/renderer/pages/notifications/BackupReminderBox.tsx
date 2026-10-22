import { useTranslation } from 'react-i18next';
import { formatDate } from '@shared/dates';
import type { BackupReminder } from '@shared/notifications';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import styles from './Notifications.module.css';

interface BackupReminderBoxProps {
  reminder: BackupReminder;
  /** Back up now (see `useBackupNow`); the caller shows the result. */
  onBackUp: () => void;
  busy: boolean;
}

/**
 * The monthly backup reminder with its one-click Back up now, which uses the
 * saved folder (and asks for one the first time). Shown on the popup and the
 * Notifications page.
 */
export function BackupReminderBox({ reminder, onBackUp, busy }: BackupReminderBoxProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
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
      </div>
      <BigButton variant="primary" onClick={onBackUp} disabled={busy}>
        {t('backup.now')}
      </BigButton>
    </div>
  );
}
