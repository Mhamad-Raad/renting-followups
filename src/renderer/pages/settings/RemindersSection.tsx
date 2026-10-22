import { useTranslation } from 'react-i18next';
import { formatPlain } from '@shared/formatNumber';
import { ALWAYS_REMIND_LAST_DAYS } from '@shared/notifications';
import { REMIND_DAY_CHOICES } from '@shared/settings';
import { useSettings } from '../../app/SettingsContext';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import type { ChangeSettings } from './SettingsPage';
import styles from './SettingsPage.module.css';

/** Settings → Reminders: how many days before the month ends the reminder starts. */
export function RemindersSection({ change }: { change: ChangeSettings }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  // A value saved outside the usual choices is still shown, so it is never silently lost.
  const choices = REMIND_DAY_CHOICES.some((days) => days === settings.remindDays)
    ? REMIND_DAY_CHOICES
    : [...REMIND_DAY_CHOICES, settings.remindDays].sort((a, b) => a - b);
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('settings.reminders')}</h2>
      <ChoiceGroup
        label={t('settings.remindDays')}
        value={String(settings.remindDays)}
        choices={choices.map((days) => ({ value: String(days), label: formatPlain(days, digits) }))}
        onChange={(days) => change({ remindDays: Number(days) })}
      />
      <p className={styles.hint}>
        {t('settings.remindDaysHint', { number: formatPlain(ALWAYS_REMIND_LAST_DAYS, digits) })}
      </p>
    </section>
  );
}
