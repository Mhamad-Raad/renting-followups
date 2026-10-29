import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  currentRenter,
  PERSON_NAME_MAX,
  PHONE_MAX,
  PHONE_PATTERN,
  type AreaDetails,
  type RenterChange,
  type RenterChangeResult,
} from '@shared/areas';
import { CURRENCIES, type Currency } from '@shared/currency';
import {
  compareYearMonth,
  dateStringFromLocal,
  formatDate,
  formatYearMonth,
  parseDateString,
  yearMonthOf,
  type YearMonth,
} from '@shared/dates';
import { currencyForMonth, priceRowForMonth, type PriceRow } from '@shared/prices';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { AmountField } from '../../components/AmountField';
import { BigButton } from '../../components/BigButton';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { DateField } from '../../components/DateField';
import { Dialog, DialogActions } from '../../components/Dialog';
import { Form } from '../../components/Form';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import styles from './AreaPage.module.css';
import { useRentCheck } from './RentCheck';

interface RenterDialogProps {
  area: AreaDetails;
  open: boolean;
  onDone: (message: string) => void;
  onClose: () => void;
}

/**
 * Change renter: a new person starts, closing the current one, and may pay a
 * different rent, in another currency, from the month they start. A renter
 * leaving is Mark as vacant.
 */
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
  const start = monthOfDate(date);
  // Filled in with the rent the place has, so a renter on the same rent needs no typing.
  const [rent, setRent] = useState(() => rentBefore(area.prices, start, area.currency));
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rentCheck = useRentCheck();
  const now = priceRowForMonth(area.prices, start);
  const rentChanges =
    rent.monthlyPrice !== now?.monthlyPrice ||
    rent.currency !== (currencyForMonth(area.prices, start) ?? area.currency);

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      rentCheck.reset();
      setProblem(null);
    };

  const nameProblem = fullName.trim() === '' ? t('common.requiredField') : null;
  const phoneProblem = PHONE_PATTERN.test(phone) ? null : t('areaForm.problems.phone');

  const explain = (reason: Exclude<RenterChangeResult, { ok: true }>['reason']) => {
    if (reason === 'before_current_renter' && current) {
      return t('renterDialog.before_current_renter', {
        date: formatDate(current.startedOn, settings.digitStyle),
      });
    }
    if (reason === 'before_rent_start' && area.prices[0]) {
      return t('priceDialog.before_rent_start', {
        month: formatYearMonth(area.prices[0], settings.digitStyle),
      });
    }
    return t(reason === 'no_room' ? 'priceDialog.no_room' : 'areaForm.problems.not_found');
  };

  const submit = async () => {
    setShowProblems(true);
    if (nameProblem || phoneProblem || !rent.monthlyPrice || busy) return;
    setBusy(true);
    const newRent = { monthlyPrice: rent.monthlyPrice, currency: rent.currency };
    if (rentChanges) {
      // What the new rent does to months already paid is shown before anything is saved.
      const checked = await rentCheck.check({ areaId: area.id, from: start, ...newRent });
      if (!mounted.current) return;
      if (checked.kind !== 'save') {
        setBusy(false);
        if (checked.kind === 'problem') setProblem(checked.text);
        return;
      }
    }
    const change: RenterChange = {
      areaId: area.id,
      fullName,
      phone,
      startedOn: date,
      ...newRent,
      ...(rentCheck.takeOut && { takeOutVacantMonths: true }),
    };
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
      <DateField label={t('renterDialog.startsOn')} value={date} onChange={edit(setDate)} />
      <ChoiceGroup
        label={t('areaForm.currency')}
        value={rent.currency}
        choices={CURRENCIES.map((code) => ({ value: code, label: t(`currency.${code}`) }))}
        onChange={edit((currency: Currency) => setRent({ currency, monthlyPrice: null }))}
      />
      {/* A new key re-creates the amount box when the currency (and its decimals) changes. */}
      <AmountField
        key={rent.currency}
        label={t('renterDialog.rent')}
        currency={rent.currency}
        value={rent.monthlyPrice}
        onChange={edit((monthlyPrice: number | null) => setRent({ ...rent, monthlyPrice }))}
        hint={t('renterDialog.rentHint', {
          month: formatYearMonth(start, settings.digitStyle),
        })}
        error={showProblems && !rent.monthlyPrice ? t('areaForm.problems.rentRequired') : null}
      />
      {rentCheck.warnings}
      {problem && <Notice tone="error">{problem}</Notice>}
      <DialogActions>
        <BigButton type="submit" variant={rentCheck.saveButton.variant} disabled={busy}>
          {rentCheck.saveButton.label}
        </BigButton>
        <BigButton onClick={onClose}>{t('common.cancel')}</BigButton>
      </DialogActions>
    </Form>
  );
}

/** The month of a date typed in the form (this month while it is not a full date yet). */
function monthOfDate(date: string): YearMonth {
  const parsed = parseDateString(date);
  return parsed ? { year: parsed.year, month: parsed.month } : yearMonthOf(new Date());
}

/**
 * The rent the new renter starts on unless it is changed: the place's rent in
 * that month or, while it stands vacant, its last rent before.
 */
function rentBefore(
  prices: readonly PriceRow[],
  month: YearMonth,
  fallback: Currency,
): { monthlyPrice: number | null; currency: Currency } {
  const row = priceRowForMonth(prices, month);
  const last = [...prices]
    .filter((each) => each.monthlyPrice > 0 && (!row || compareYearMonth(each, row) <= 0))
    .at(-1);
  const rent = row && row.monthlyPrice > 0 ? row : last;
  return rent
    ? { monthlyPrice: rent.monthlyPrice, currency: rent.currency }
    : { monthlyPrice: null, currency: row?.currency ?? fallback };
}
