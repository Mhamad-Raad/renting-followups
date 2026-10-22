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

/** The short coloured label of a reminder: how many months are late, or Due. */
function ReminderPill({ reminder }: { reminder: AreaReminder }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return reminder.kind === 'late' ? (
    <StatusPill status="late">
      {t('home.lateMonths', { number: formatPlain(reminder.months.length, settings.digitStyle) })}
    </StatusPill>
  ) : (
    <StatusPill status="due">{t('months.status.due')}</StatusPill>
  );
}

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
        <ReminderPill reminder={reminder} />
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
      <ReminderPill reminder={reminder} />
      <span className={styles.detail}>
        {reminder.daysLeft === 1
          ? t('notifications.lastDay', { month })
          : t('notifications.endsOn', { month, date: formatDate(reminder.endsOn, digits) })}
      </span>
    </>
  );
}

interface ReminderRowProps {
  reminder: AreaReminder;
  onOpen?: () => void;
  /** The popup's short form: one line per area, without the list of months. */
  compact?: boolean;
}

/** One reminder: the area, its renter, what is wrong and owed, and Record payment. */
export function ReminderRow({ reminder, onOpen, compact = false }: ReminderRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <li className={compact ? `${styles.row} ${styles.compact}` : styles.row}>
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
        {compact ? (
          <ReminderPill reminder={reminder} />
        ) : (
          <ReminderDescription reminder={reminder} />
        )}
        {!compact && <span className={styles.second}>{t('notifications.owes')}</span>}
        <strong className={styles.owed}>
          <MoneyText amount={reminder.owed} currency={reminder.currency} />
        </strong>
      </div>
      <BigButton
        variant={compact ? 'secondary' : 'primary'}
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
