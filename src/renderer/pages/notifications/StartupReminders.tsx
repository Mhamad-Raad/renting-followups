import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatPlain } from '@shared/formatNumber';
import { isAreaReminder } from '@shared/notifications';
import { useIpcQuery } from '../../app/ipc';
import { useBackupNow } from '../../app/useBackupNow';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { Dialog, DialogActions } from '../../components/Dialog';
import { Notice } from '../../components/Notice';
import styles from './Notifications.module.css';
import { BackupReminderBox } from './BackupReminderBox';
import { ReminderRow } from './ReminderRow';

/** The popup shows the first few; the rest are one click away on the Notifications page. */
const POPUP_LIMIT = 8;

/**
 * The popup when the app opens (ARCHITECTURE.md section 11): the same
 * reminders as the Notifications page, with OK and Go to Notifications.
 * Nothing appears when there is nothing to report.
 */
export function StartupReminders() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const reminders = useIpcQuery('notifications:list');
  const backupNow = useBackupNow();
  // The layout, and so this popup, stays on screen for the whole session: it shows once per start.
  const [dismissed, setDismissed] = useState(false);
  const items = reminders.state.status === 'ready' ? reminders.state.data : [];
  const open = !dismissed && items.length > 0;
  // The backup reminder has its own box at the top, so a long late-rent list never hides it.
  const backup = items.find((item) => item.kind === 'backup');
  const areaItems = items.filter(isAreaReminder);

  const close = () => setDismissed(true);
  const rest = areaItems.length - POPUP_LIMIT;
  return (
    <Dialog open={open} title={t('notifications.popupTitle')} onClose={close} size="large">
      <div className={styles.popup}>
        {areaItems.length > 0 && (
          <p className={styles.summary}>
            {t('notifications.popupSummary', {
              number: formatPlain(areaItems.length, settings.digitStyle),
            })}
          </p>
        )}
        {backupNow.message && (
          <Notice tone={backupNow.message.tone}>{backupNow.message.text}</Notice>
        )}
        {backup && backupNow.message?.tone !== 'success' && (
          <BackupReminderBox
            reminder={backup}
            onBackUp={() => void backupNow.backUp()}
            busy={backupNow.busy}
          />
        )}
        {areaItems.length > 0 && (
          <div className={styles.popupList}>
            <ul className={styles.list}>
              {areaItems.slice(0, POPUP_LIMIT).map((item) => (
                <ReminderRow
                  key={`${item.kind}-${item.areaId}`}
                  reminder={item}
                  onOpen={close}
                  compact
                />
              ))}
            </ul>
            {rest > 0 && (
              <p className={styles.more}>
                {t('notifications.more', { number: formatPlain(rest, settings.digitStyle) })}
              </p>
            )}
          </div>
        )}
      </div>
      <DialogActions>
        <BigButton variant="primary" autoFocus onClick={close}>
          {t('common.ok')}
        </BigButton>
        <BigButton
          onClick={() => {
            close();
            void navigate('/notifications');
          }}
        >
          {t('notifications.goTo')}
        </BigButton>
      </DialogActions>
    </Dialog>
  );
}
