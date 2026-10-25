import { useTranslation } from 'react-i18next';
import { isAreaReminder, type AreaReminder } from '@shared/notifications';
import { useBackupNow } from '../../app/useBackupNow';
import { useReminders } from '../../app/useReminders';
import { LoadError } from '../../components/LoadError';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import styles from './Notifications.module.css';
import { BackupReminderBox } from './BackupReminderBox';
import { ReminderRow } from './ReminderRow';

/** The backup reminder, late rent and month-end reminders, worked out fresh from the data. */
export function NotificationsPage() {
  const { t } = useTranslation();
  const reminders = useReminders();
  // The result stays here: after a backup the reminder (and its box) goes away.
  const backupNow = useBackupNow();
  const header = <PageHeader title={t('pages.notifications.title')} />;
  if (reminders.state.status === 'loading') return header;
  if (reminders.state.status === 'error') {
    return (
      <>
        {header}
        <LoadError onRetry={reminders.reload} />
      </>
    );
  }
  const items = reminders.state.data;
  const backup = items.find((item) => item.kind === 'backup');
  const areaItems = items.filter(isAreaReminder);
  const late = areaItems.filter((item) => item.kind === 'late');
  const monthEnd = areaItems.filter((item) => item.kind === 'month_end');
  return (
    <>
      {header}
      <div className={styles.stack}>
        {items.length === 0 && <Notice tone="success">{t('notifications.none')}</Notice>}
        {backupNow.message && (
          <Notice tone={backupNow.message.tone}>{backupNow.message.text}</Notice>
        )}
        {backup && (
          <BackupReminderBox
            reminder={backup}
            onBackUp={() => void backupNow.backUp()}
            busy={backupNow.busy}
          />
        )}
        <ReminderSection title={t('notifications.late')} items={late} />
        <ReminderSection title={t('notifications.monthEnd')} items={monthEnd} />
      </div>
    </>
  );
}

function ReminderSection({ title, items }: { title: string; items: readonly AreaReminder[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <ul className={styles.list} aria-label={title}>
        {items.map((item) => (
          <ReminderRow key={`${item.kind}-${item.areaId}`} reminder={item} />
        ))}
      </ul>
    </section>
  );
}
