import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatPlain } from '@shared/formatNumber';
import { useIpcQuery } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { Dialog, DialogActions } from '../../components/Dialog';
import styles from './Notifications.module.css';
import { ReminderRow } from './ReminderRow';

/** The popup shows the first few; the rest are one click away on the Notifications page. */
const POPUP_LIMIT = 6;

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
  // The layout, and so this popup, stays on screen for the whole session: it shows once per start.
  const [dismissed, setDismissed] = useState(false);
  const items = reminders.state.status === 'ready' ? reminders.state.data : [];
  const open = !dismissed && items.length > 0;

  const close = () => setDismissed(true);
  const rest = items.length - POPUP_LIMIT;
  return (
    <Dialog open={open} title={t('notifications.popupTitle')} onClose={close}>
      <ul className={`${styles.list} ${styles.popupList}`}>
        {items.slice(0, POPUP_LIMIT).map((item) => (
          <ReminderRow key={`${item.kind}-${item.areaId}`} reminder={item} onOpen={close} />
        ))}
      </ul>
      {rest > 0 && (
        <p className={styles.more}>
          {t('notifications.more', { number: formatPlain(rest, settings.digitStyle) })}
        </p>
      )}
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
