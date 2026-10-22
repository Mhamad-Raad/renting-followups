import { useTranslation } from 'react-i18next';
import type { Reminder } from '@shared/notifications';
import { useReminders } from '../../app/useReminders';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import styles from './Notifications.module.css';
import { ReminderRow } from './ReminderRow';

/** Late rent and month-end reminders, worked out fresh from the data. */
export function NotificationsPage() {
  const { t } = useTranslation();
  const reminders = useReminders();
  const header = <PageHeader title={t('pages.notifications.title')} />;
  if (reminders.state.status === 'loading') return header;
  if (reminders.state.status === 'error') {
    return (
      <>
        {header}
        <Notice tone="error">{t('errors.unexpected')}</Notice>
      </>
    );
  }
  const items = reminders.state.data;
  const late = items.filter((item) => item.kind === 'late');
  const monthEnd = items.filter((item) => item.kind === 'month_end');
  return (
    <>
      {header}
      <div className={styles.stack}>
        {items.length === 0 && <Notice tone="success">{t('notifications.none')}</Notice>}
        <ReminderSection title={t('notifications.late')} items={late} />
        <ReminderSection title={t('notifications.monthEnd')} items={monthEnd} />
      </div>
    </>
  );
}

function ReminderSection({ title, items }: { title: string; items: readonly Reminder[] }) {
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
