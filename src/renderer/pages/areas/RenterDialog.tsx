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
import { CURRENCIES, FRACTION_DIGITS, type Currency } from '@shared/currency';
import {
  compareYearMonth,
  dateStringFromLocal,
  formatDate,
  formatYearMonth,
  parseDateString,
  yearMonthOf,
  type YearMonth,
} from '@shared/dates';
import { isolateNumber } from '@shared/digits';
import { formatAmount } from '@shared/formatNumber';
import { currencyForMonth, priceRowForMonth, type PriceRow } from '@shared/prices';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { AmountField } from '../../components/AmountField';
import { BigButton } from '../../components/BigButton';
import { Checkbox } from '../../components/Checkbox';
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
    <Dialog open={open} title={t('renterDialog.title')} onClose={onClose} size="wide">
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
  // Most new renters pay what the place costs now: a ticked box, with no rent to type.
  const sameRent = rentBefore(area.prices, start, area.currency);
  const [keepRent, setKeepRent] = useState(sameRent.monthlyPrice !== null);
  // The rent typed after unticking it.
  const [newRent, setNewRent] = useState(sameRent);
  const rent = keepRent ? sameRent : newRent;
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rentCheck = useRentCheck();
  const now = priceRowForMonth(area.prices, start);
  // Before the rent starts there is no rent to change: only the renter is added.
  const rentChanges =
    now !== null &&
    (rent.monthlyPrice !== now.monthlyPrice ||
      rent.currency !== (currencyForMonth(area.prices, start) ?? area.currency));
  const digits = settings.digitStyle;
  const money = (amount: number, currency: Currency) =>
    `${isolateNumber(formatAmount(amount, FRACTION_DIGITS[currency], digits), digits)} ${t(`currency.${currency}`)}`;
  const untickRent = (keep: boolean) => {
    // Unticked, the fields start from the same rent, ready to be changed.
    if (!keep) setNewRent(sameRent);
    setKeepRent(keep);
  };

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
    const chosen = { monthlyPrice: rent.monthlyPrice, currency: rent.currency };
    if (rentChanges) {
      // What the new rent does to months already paid is shown before anything is saved.
      const checked = await rentCheck.check({ areaId: area.id, from: start, ...chosen });
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
      ...chosen,
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
      <section className={styles.formPart} aria-labelledby="renter-part">
        <h3 id="renter-part" className={styles.partTitle}>
          {t('renterDialog.who')}
        </h3>
        {/* Two fields per row, the date across the whole width. */}
        <div className={styles.formGrid}>
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
          <div className={styles.fullRow}>
            <DateField label={t('renterDialog.startsOn')} value={date} onChange={edit(setDate)} />
          </div>
        </div>
      </section>
      {/* Before the rent starts there is no rent to keep or change. */}
      {now !== null && (
        <section className={styles.formPart} aria-labelledby="rent-part">
          <h3 id="rent-part" className={styles.partTitle}>
            {t('renterDialog.pays')}
          </h3>
          {sameRent.monthlyPrice !== null && (
            <Checkbox
              label={t(
                now.monthlyPrice > 0 ? 'renterDialog.sameRent' : 'renterDialog.sameRentBefore',
                {
                  amount: money(sameRent.monthlyPrice, sameRent.currency),
                },
              )}
              checked={keepRent}
              onChange={edit(untickRent)}
            />
          )}
          {!keepRent && (
            <div className={styles.formGrid}>
              <ChoiceGroup
                label={t('areaForm.currency')}
                value={newRent.currency}
                choices={CURRENCIES.map((code) => ({ value: code, label: t(`currency.${code}`) }))}
                onChange={edit((currency: Currency) =>
                  setNewRent({ currency, monthlyPrice: null }),
                )}
              />
              {/* A new key re-creates the amount box when the currency (and its decimals) changes. */}
              <AmountField
                key={newRent.currency}
                label={t('renterDialog.rent')}
                currency={newRent.currency}
                value={newRent.monthlyPrice}
                onChange={edit((monthlyPrice: number | null) =>
                  setNewRent({ ...newRent, monthlyPrice }),
                )}
                autoFocus
                error={
                  showProblems && !newRent.monthlyPrice ? t('areaForm.problems.rentRequired') : null
                }
              />
            </div>
          )}
          <p className={styles.hint}>
            {t('renterDialog.rentHint', { month: formatYearMonth(start, settings.digitStyle) })}
          </p>
        </section>
      )}
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
