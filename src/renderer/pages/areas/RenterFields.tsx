import { useTranslation } from 'react-i18next';
import { PERSON_NAME_MAX, PHONE_MAX } from '@shared/areas';
import type { DateString } from '@shared/dates';
import { DateField } from '../../components/DateField';
import { TextField } from '../../components/TextField';
import styles from './AreaFormPage.module.css';

/** The renter typed in the area form. */
export interface RenterInput {
  name: string;
  phone: string;
  since: DateString;
}

interface RenterFieldsProps {
  /** Editing corrects the current renter's spelling; adding also asks since when. */
  editing: boolean;
  renter: RenterInput;
  onChange: (renter: RenterInput) => void;
  nameError: string | null;
  phoneError: string | null;
}

/** The renter part of the area form. */
export function RenterFields({
  editing,
  renter,
  onChange,
  nameError,
  phoneError,
}: RenterFieldsProps) {
  const { t } = useTranslation();
  const change = (changes: Partial<RenterInput>) => onChange({ ...renter, ...changes });
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('areaForm.renter')}</h2>
      <p className={styles.hint}>
        {t(editing ? 'areaForm.renterEditHint' : 'areaForm.renterHint')}
      </p>
      <TextField
        label={t('areaForm.renterName')}
        value={renter.name}
        onChange={(name) => change({ name })}
        error={nameError}
        maxLength={PERSON_NAME_MAX}
        dir="auto"
      />
      <TextField
        label={t('areaForm.renterPhone')}
        value={renter.phone}
        onChange={(phone) => change({ phone })}
        error={phoneError}
        maxLength={PHONE_MAX}
        inputMode="tel"
        dir="ltr"
      />
      {!editing && renter.name.trim() !== '' && (
        <DateField
          label={t('areaForm.renterSince')}
          value={renter.since}
          onChange={(since) => change({ since })}
        />
      )}
    </section>
  );
}
