import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaDetails } from '@shared/areas';
import { formatYearMonth, yearMonthOf } from '@shared/dates';
import { callIpc } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { AmountField } from '../../components/AmountField';
import { BigButton } from '../../components/BigButton';
import { Dialog, DialogActions } from '../../components/Dialog';
import { Form } from '../../components/Form';
import { MonthYearField } from '../../components/MonthYearField';
import { Notice } from '../../components/Notice';
import styles from './AreaPage.module.css';

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
  const { settings } = useSettings();
  const [from, setFrom] = useState(yearMonthOf(new Date()));
  const [price, setPrice] = useState<number | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsPrice = mode !== 'vacant';
  const rentStart = area.prices[0];

  const submit = async () => {
    setShowProblems(true);
    if ((needsPrice && price === null) || busy) return;
    setBusy(true);
    const result = await callIpc('areas:changePrice', {
      areaId: area.id,
      from,
      monthlyPrice: needsPrice ? (price ?? 0) : 0,
    });
    setBusy(false);
    if (!result.ok) {
      setProblem(t('errors.unexpected'));
    } else if (!result.data.ok) {
      setProblem(
        result.data.reason === 'before_rent_start' && rentStart
          ? t('priceDialog.before_rent_start', {
              month: formatYearMonth(rentStart, settings.digitStyle),
            })
          : t('areaForm.problems.not_found'),
      );
    } else {
      onDone(t(mode === 'vacant' ? 'priceDialog.vacantSaved' : 'priceDialog.priceSaved'));
    }
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      <MonthYearField
        label={t('priceDialog.from')}
        value={from}
        onChange={setFrom}
        hint={t(mode === 'vacant' ? 'priceDialog.vacantHint' : 'priceDialog.changeHint')}
      />
      {needsPrice && (
        <AmountField
          label={t('priceDialog.newRent')}
          currency={area.currency}
          value={price}
          onChange={setPrice}
          autoFocus
          error={showProblems && price === null ? t('areaForm.problems.rentRequired') : null}
        />
      )}
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
