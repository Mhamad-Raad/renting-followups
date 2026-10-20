import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PHONE_PATTERN, type AreaDetails, type RenterChange } from '@shared/areas';
import { dateStringFromLocal, formatDate } from '@shared/dates';
import { callIpc } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { ChoiceGroup } from '../../components/ChoiceGroup';
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

/** Change renter: a new person starts (closing the current one), or the current renter left. */
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
  const { settings } = useSettings();
  const current = area.renters.find((renter) => renter.endedOn === null) ?? null;
  const [kind, setKind] = useState<RenterChange['kind']>('new');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(dateStringFromLocal(new Date()));
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameProblem = kind === 'new' && fullName.trim() === '' ? t('common.requiredField') : null;
  const phoneProblem =
    kind === 'new' && !PHONE_PATTERN.test(phone) ? t('areaForm.problems.phone') : null;

  const explain = (reason: 'not_found' | 'no_current_renter' | 'before_current_renter') => {
    if (reason === 'before_current_renter' && current) {
      return t('renterDialog.before_current_renter', {
        date: formatDate(current.startedOn, settings.digitStyle),
      });
    }
    return reason === 'no_current_renter'
      ? t('renterDialog.no_current_renter')
      : t('areaForm.problems.not_found');
  };

  const submit = async () => {
    setShowProblems(true);
    if (nameProblem || phoneProblem || busy) return;
    const change: RenterChange =
      kind === 'new'
        ? { kind, areaId: area.id, fullName, phone, startedOn: date }
        : { kind, areaId: area.id, endedOn: date };
    setBusy(true);
    const result = await callIpc('areas:changeRenter', change);
    setBusy(false);
    if (!result.ok) setProblem(t('errors.unexpected'));
    else if (!result.data.ok) setProblem(explain(result.data.reason));
    else onDone(t(kind === 'new' ? 'renterDialog.saved' : 'renterDialog.leftSaved'));
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      {current && (
        <ChoiceGroup
          label={t('renterDialog.what')}
          value={kind}
          choices={[
            { value: 'new', label: t('renterDialog.newRenter') },
            { value: 'left', label: t('renterDialog.leftTitle') },
          ]}
          onChange={setKind}
        />
      )}
      {kind === 'new' && (
        <>
          <TextField
            label={t('renterDialog.name')}
            value={fullName}
            onChange={setFullName}
            error={showProblems ? nameProblem : null}
            autoFocus
            dir="auto"
          />
          <TextField
            label={t('renterDialog.phone')}
            value={phone}
            onChange={setPhone}
            error={showProblems ? phoneProblem : null}
            inputMode="tel"
            dir="ltr"
          />
        </>
      )}
      <DateField
        label={t(kind === 'new' ? 'renterDialog.startsOn' : 'renterDialog.leftOn')}
        value={date}
        onChange={setDate}
      />
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
