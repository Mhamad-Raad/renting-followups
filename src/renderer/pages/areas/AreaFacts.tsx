import { useTranslation } from 'react-i18next';
import { currentRenter, type AreaDetails } from '@shared/areas';
import { formatDate } from '@shared/dates';
import { useSettings } from '../../app/SettingsContext';
import { CategoryDot } from '../../components/CategoryDot';
import { PhoneText } from '../../components/PhoneText';
import styles from './AreaPage.module.css';
import { RentText } from './RentText';

/** The area's details at the top of its page: rent, renter, category, currency, address, notes. */
export function AreaFacts({ area, price }: { area: AreaDetails; price: number | null }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const renter = currentRenter(area.renters);
  const date = (value: string) => formatDate(value, settings.digitStyle);
  return (
    <section className={styles.card}>
      <dl className={styles.facts}>
        <div>
          <dt>{t('area.rent')}</dt>
          <dd className={styles.big}>
            <RentText price={price} currency={area.currency} />
          </dd>
        </div>
        <div>
          <dt>{t('area.renter')}</dt>
          <dd className={styles.big}>{renter?.fullName ?? t('areas.noRenter')}</dd>
        </div>
        <div>
          <dt>{t('area.phone')}</dt>
          <dd>{renter?.phone ? <PhoneText phone={renter.phone} /> : '—'}</dd>
        </div>
        <div>
          <dt>{t('area.category')}</dt>
          <dd className={styles.category}>
            <CategoryDot color={area.category.color} />
            {area.category.name}
          </dd>
        </div>
        <div>
          <dt>{t('area.currency')}</dt>
          <dd>{t(`currency.${area.currency}`)}</dd>
        </div>
        {area.address && (
          <div>
            <dt>{t('area.address')}</dt>
            <dd>{area.address}</dd>
          </div>
        )}
        {area.contractStart && (
          <div>
            <dt>{t('area.contractStart')}</dt>
            <dd>{date(area.contractStart)}</dd>
          </div>
        )}
      </dl>
      {area.notes && (
        <div className={styles.notes}>
          <h2 className={styles.label}>{t('area.notes')}</h2>
          <p dir="auto">{area.notes}</p>
        </div>
      )}
    </section>
  );
}
