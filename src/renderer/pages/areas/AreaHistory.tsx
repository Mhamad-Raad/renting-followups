import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import { formatDate, formatYearMonth } from '@shared/dates';
import { useSettings } from '../../app/SettingsContext';
import { PhoneText } from '../../components/PhoneText';
import styles from './AreaPage.module.css';
import { RentText } from './RentText';

/** The area's price history and renter history, newest first. */
export function AreaHistory({ area }: { area: AreaDetails }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const date = (value: string) => formatDate(value, settings.digitStyle);
  return (
    <div className={styles.histories}>
      <details className={styles.card} open>
        <summary className={styles.label}>{t('area.priceHistory')}</summary>
        <ul className={styles.history}>
          {[...area.prices].reverse().map((row) => (
            <li key={`${row.year}-${row.month}`}>
              <span>
                {t('area.priceFrom', { month: formatYearMonth(row, settings.digitStyle) })}
              </span>
              <strong>
                <RentText price={row.monthlyPrice} currency={area.currency} />
              </strong>
            </li>
          ))}
        </ul>
      </details>
      <details className={styles.card} open>
        <summary className={styles.label}>{t('area.renterHistory')}</summary>
        {area.renters.length === 0 ? (
          <p className={styles.muted}>{t('areas.noRenter')}</p>
        ) : (
          <ul className={styles.history}>
            {area.renters.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{entry.fullName}</strong> <PhoneText phone={entry.phone} />
                </span>
                <span>
                  {entry.endedOn
                    ? t('area.renterPeriod', {
                        from: date(entry.startedOn),
                        to: date(entry.endedOn),
                      })
                    : t('area.renterSinceDate', { from: date(entry.startedOn) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
