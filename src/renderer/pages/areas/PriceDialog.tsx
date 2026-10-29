import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import { formatYearMonth, yearMonthOf } from '@shared/dates';
import { currencyForMonth } from '@shared/prices';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { AmountField } from '../../components/AmountField';
import { BigButton } from '../../components/BigButton';
import { Dialog, DialogActions } from '../../components/Dialog';
import { Form } from '../../components/Form';
import { MonthYearField } from '../../components/MonthYearField';
import { Notice } from '../../components/Notice';
import styles from './AreaPage.module.css';
import { useRentCheck } from './RentCheck';

/** 'change' sets a new price, 'vacant' sets no rent (price 0), 'rentAgain' ends a vacancy. */
export type PriceMode = 'change' | 'vacant' | 'rentAgain';

const TITLES = {
  change: 'priceDialog.changeTitle',
  vacant: 'priceDialog.vacantTitle',
  rentAgain: 'priceDialog.rentAgainTitle',
} as const;

interface PriceDialogProps {
  area: AreaDetails;
  mode: PriceMode | null;
  onDone: (message: string) => void;
  onClose: () => void;
}

export function PriceDialog({ area, mode, onDone, onClose }: PriceDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={mode !== null} title={mode ? t(TITLES[mode]) : ''} onClose={onClose}>
      {mode && <PriceForm area={area} mode={mode} onDone={onDone} onClose={onClose} />}
    </Dialog>
  );
}

function PriceForm({ area, mode, onDone, onClose }: PriceDialogProps & { mode: PriceMode }) {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const { settings } = useSettings();
  const [from, setFrom] = useState(yearMonthOf(new Date()));
  const [price, setPrice] = useState<number | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rentCheck = useRentCheck();
  const needsPrice = mode !== 'vacant';
  // A new price is in the currency of the month it starts from.
  const currency = currencyForMonth(area.prices, from) ?? area.currency;
  const rentStart = area.prices[0];

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      rentCheck.reset();
      setProblem(null);
    };

  const submit = async () => {
    setShowProblems(true);
    if ((needsPrice && price === null) || busy) return;
    setBusy(true);
    const change = {
      areaId: area.id,
      from,
      monthlyPrice: needsPrice ? (price ?? 0) : 0,
      ...(rentCheck.takeOut && { takeOutVacantMonths: true }),
    };
    const checked = await rentCheck.check(change);
    if (!mounted.current) return;
    if (checked.kind !== 'save') {
      setBusy(false);
      if (checked.kind === 'problem') setProblem(checked.text);
      return;
    }
    const result = await callIpc('areas:changePrice', change);
    // A saved change always reaches the page, even if the dialog was closed meanwhile.
    if (result.ok && result.data.ok) {
      onDone(t(mode === 'vacant' ? 'priceDialog.vacantSaved' : 'priceDialog.priceSaved'));
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) {
      setProblem(t('errors.unexpected'));
    } else if (!result.data.ok) {
      const { reason } = result.data;
      setProblem(
        reason === 'before_rent_start' && rentStart
          ? t('priceDialog.before_rent_start', {
              month: formatYearMonth(rentStart, settings.digitStyle),
            })
          : reason === 'no_room'
            ? t('priceDialog.no_room')
            : t('areaForm.problems.not_found'),
      );
    }
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      <MonthYearField
        label={t('priceDialog.from')}
        value={from}
        onChange={edit(setFrom)}
        hint={t(mode === 'vacant' ? 'priceDialog.vacantHint' : 'priceDialog.changeHint')}
      />
      {needsPrice && (
        <AmountField
          label={t('priceDialog.newRent')}
          currency={currency}
          value={price}
          onChange={edit(setPrice)}
          autoFocus
          error={showProblems && price === null ? t('areaForm.problems.rentRequired') : null}
        />
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
