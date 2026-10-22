import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { PART_SEPARATOR } from '@shared/reportText';
import { formatDate, formatMonthRuns, formatYearMonth } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import type { AreaReminder } from '@shared/notifications';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { MoneyText } from '../../components/MoneyText';
import { StatusPill } from '../../components/MonthBoxes';
import { PhoneText } from '../../components/PhoneText';
import { areaLink, recordPaymentLink } from '../areas/links';
import styles from './Notifications.module.css';

/**
 * What a reminder says, in the same words on the popup and the Notifications
 * page: a short coloured label, then the months or days left on a line that
 * wraps, so a long list never makes the page wider than the window.
 */
export function ReminderDescription({ reminder }: { reminder: AreaReminder }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  if (reminder.kind === 'late') {
    return (
      <>
        <StatusPill status="late">
          {t('home.lateMonths', { number: formatPlain(reminder.months.length, digits) })}
        </StatusPill>
        <span className={styles.detail}>
          {t('receipts.months', {
            months: formatMonthRuns(reminder.months, digits, t('receipts.separator')),
          })}
        </span>
      </>
    );
  }
  const month = formatYearMonth(reminder.month, digits);
  return (
    <>
      <StatusPill status="due">{t('months.status.due')}</StatusPill>
      <span className={styles.detail}>
        {reminder.daysLeft === 1
          ? t('notifications.lastDay', { month })
          : t('notifications.endsOn', { month, date: formatDate(reminder.endsOn, digits) })}
      </span>
    </>
  );
}

/** One reminder: the area, its renter, what is wrong and owed, and Record payment. */
export function ReminderRow({ reminder, onOpen }: { reminder: AreaReminder; onOpen?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <li className={styles.row}>
      <div className={styles.who}>
        <Link to={areaLink(reminder.areaId)} className={styles.name} onClick={onOpen}>
          {reminder.areaName}
        </Link>
        <span className={styles.second}>
          {reminder.renterName ?? t('areas.noRenter')}
          {reminder.renterPhone && (
            <>
              {PART_SEPARATOR}
              <PhoneText phone={reminder.renterPhone} />
            </>
          )}
        </span>
      </div>
      <div className={styles.what}>
        <ReminderDescription reminder={reminder} />
        <span className={styles.second}>{t('notifications.owes')}</span>
        <strong className={styles.owed}>
          <MoneyText amount={reminder.owed} currency={reminder.currency} />
        </strong>
      </div>
      <BigButton
        variant="primary"
        onClick={() => {
          onOpen?.();
          void navigate(recordPaymentLink(reminder.areaId));
        }}
      >
        {t('area.recordPayment')}
      </BigButton>
    </li>
  );
}
