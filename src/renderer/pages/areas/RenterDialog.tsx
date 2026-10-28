import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  currentRenter,
  PERSON_NAME_MAX,
  PHONE_MAX,
  PHONE_PATTERN,
  type AreaDetails,
  type RenterChange,
} from '@shared/areas';
import { dateStringFromLocal, formatDate } from '@shared/dates';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { DateField } from '../../components/DateField';
import { Dialog, DialogActions } from '../../components/Dialog';
import { Form } from '../../components/Form';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import styles from './AreaPage.module.css';

interface RenterDialogProps {
  area: AreaDetails;
  open: boolean;
  onDone: (message: string) => void;
  onClose: () => void;
}

/** Change renter: a new person starts, closing the current one. A renter leaving is Mark as vacant. */
export function RenterDialog({ area, open, onDone, onClose }: RenterDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} title={t('renterDialog.title')} onClose={onClose}>
      <RenterForm area={area} onDone={onDone} onClose={onClose} />
    </Dialog>
  );
}

function RenterForm({ area, onDone, onClose }: Omit<RenterDialogProps, 'open'>) {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const { settings } = useSettings();
  const current = currentRenter(area.renters);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(dateStringFromLocal(new Date()));
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameProblem = fullName.trim() === '' ? t('common.requiredField') : null;
  const phoneProblem = PHONE_PATTERN.test(phone) ? null : t('areaForm.problems.phone');

  const explain = (reason: 'not_found' | 'before_current_renter') =>
    reason === 'before_current_renter' && current
      ? t('renterDialog.before_current_renter', {
          date: formatDate(current.startedOn, settings.digitStyle),
        })
      : t('areaForm.problems.not_found');

  const submit = async () => {
    setShowProblems(true);
    if (nameProblem || phoneProblem || busy) return;
    const change: RenterChange = { areaId: area.id, fullName, phone, startedOn: date };
    setBusy(true);
    const result = await callIpc('areas:changeRenter', change);
    // A saved change always reaches the page, even if the dialog was closed meanwhile.
    if (result.ok && result.data.ok) {
      onDone(t('renterDialog.saved'));
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) setProblem(t('errors.unexpected'));
    else if (!result.data.ok) setProblem(explain(result.data.reason));
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      <TextField
        label={t('renterDialog.name')}
        value={fullName}
        onChange={setFullName}
        error={showProblems ? nameProblem : null}
        maxLength={PERSON_NAME_MAX}
        autoFocus
        dir="auto"
      />
      <TextField
        label={t('renterDialog.phone')}
        value={phone}
        onChange={setPhone}
        error={showProblems ? phoneProblem : null}
        maxLength={PHONE_MAX}
        inputMode="tel"
        dir="ltr"
      />
      <DateField label={t('renterDialog.startsOn')} value={date} onChange={setDate} />
      {problem && <Notice tone="error">{problem}</Notice>}
      <DialogActions>
        <BigButton type="submit" variant="primary" disabled={busy}>
          {t('common.save')}
        </BigButton>
        <BigButton onClick={onClose}>{t('common.cancel')}</BigButton>
      </DialogActions>
    </Form>
  );
}
