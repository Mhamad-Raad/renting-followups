import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { areaLabel, type AreaDetails } from '@shared/areas';
import { yearMonthOf } from '@shared/dates';
import { formatReceiptNumber, type Receipt } from '@shared/payments';
import { priceForMonth } from '@shared/prices';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { flash, useFlashNotice } from '../../app/flash';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LoadError } from '../../components/LoadError';
import { LinkButton } from '../../components/LinkButton';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { usePrint } from '../../print/usePrint';
import { AreaFacts } from './AreaFacts';
import { AreaHistory } from './AreaHistory';
import { AreaPeriod } from './AreaPeriod';
import styles from './AreaPage.module.css';
import { AREA_ACTION_PARAM, editAreaLink, isAreaAction, type AreaAction } from './links';
import { parseRouteId } from '../../app/parseRouteId';
import { PaymentDialog, type PaymentMode, type PaymentSaved } from './PaymentDialog';
import { PriceDialog, type PriceMode } from './PriceDialog';
import { RenterDialog } from './RenterDialog';
import { useAreaPeriod } from './useAreaPeriod';
import { useMonthPick } from './useMonthPick';

type OpenDialog =
  | { kind: 'price'; mode: PriceMode }
  | { kind: 'payment'; mode: PaymentMode }
  | { kind: 'cancelReceipt'; receipt: Receipt }
  | { kind: 'renter' }
  | { kind: 'delete' }
  | null;

/** The dialog each action from another screen opens (see `areaActionLink`). */
const ACTION_DIALOGS: Record<AreaAction, NonNullable<OpenDialog>> = {
  payment: { kind: 'payment', mode: { kind: 'new' } },
  pastPayment: { kind: 'payment', mode: { kind: 'past' } },
  changePrice: { kind: 'price', mode: 'change' },
  markVacant: { kind: 'price', mode: 'vacant' },
  setRentAgain: { kind: 'price', mode: 'rentAgain' },
  changeRenter: { kind: 'renter' },
  delete: { kind: 'delete' },
};

/** One area: its details, its price and renter history, and the actions that change them. */
export function AreaPage() {
  const { t } = useTranslation();
  const areaId = parseRouteId(useParams().id);
  const area = useIpcQuery('areas:get', { id: areaId ?? 0 });

  if (area.state.status === 'loading') return null;
  if (area.state.status === 'error') return <LoadError onRetry={area.reload} />;
  if (areaId === null || area.state.data === null) {
    return (
      <>
        <Notice tone="error">{t('areaForm.problems.not_found')}</Notice>
        <div className={styles.back}>
          <LinkButton to="/areas" icon="back">
            {t('area.back')}
          </LinkButton>
        </div>
      </>
    );
  }
  return <AreaView area={area.state.data} onChanged={area.refresh} />;
}

function AreaView({ area, onChanged }: { area: AreaDetails; onChanged: () => void }) {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const flashed = useFlashNotice();
  const [notice, setNotice] = useState<string | null>(flashed);
  const [searchParams, setSearchParams] = useSearchParams();
  // Opened with an action (Home's "Record payment", the Areas list's ⋯ menu): start with its dialog open.
  const [dialog, setDialog] = useState<OpenDialog>(() => {
    const action = searchParams.get(AREA_ACTION_PARAM);
    return isAreaAction(action) ? ACTION_DIALOGS[action] : null;
  });
  useEffect(() => {
    if (searchParams.has(AREA_ACTION_PARAM)) void setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [problem, setProblem] = useState<string | null>(null);
  // The payment saved last on this screen; it can be undone for as long as the screen is open.
  const [undoable, setUndoable] = useState<PaymentSaved['undo'] | null>(null);

  const today = yearMonthOf(new Date());
  const price = priceForMonth(area.prices, today);
  const period = useAreaPeriod(area.id, today.year);

  const done = (message: string) => {
    setDialog(null);
    setProblem(null);
    setNotice(message);
    setUndoable(null);
    onChanged();
    period.refresh();
  };

  const monthPick = useMonthPick((outcome) => {
    if (outcome.tone === 'error') {
      setProblem(outcome.text);
      period.refresh();
      return;
    }
    done(outcome.text);
    // A month marked as paid can be undone, like any new payment.
    setUndoable(outcome.undo ?? null);
  });

  const printing = usePrint();
  const printReceipt = (id: number) =>
    void printing.run({ kind: 'receipt', id, output: 'printer' });

  const paymentSaved = ({ message, undo, print }: PaymentSaved) => {
    done(message);
    setUndoable(undo ?? null);
    if (print && undo) printReceipt(undo.id);
  };

  // Undo and Cancel receipt both cancel the receipt: it stays listed, and its number is never reused.
  const cancelReceipt = async (id: number, message: string) => {
    setDialog(null);
    const result = await callIpc('payments:void', { id });
    if (!mounted.current) return;
    if (result.ok && result.data.ok) done(message);
    else setProblem(t('errors.unexpected'));
  };

  const undo = () => {
    if (!undoable) return;
    const { id, receiptNumber } = undoable;
    void cancelReceipt(
      id,
      receiptNumber === null
        ? t('receipts.pastUndone')
        : t('receipts.undone', { number: formatReceiptNumber(receiptNumber, settings.digitStyle) }),
    );
  };

  const remove = async () => {
    setDialog(null);
    const result = await callIpc('areas:delete', { id: area.id });
    if (!mounted.current) return;
    if (result.ok && result.data.ok) {
      void navigate('/areas', { state: flash(t('areas.deleted')) });
    } else {
      setProblem(t('errors.unexpected'));
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: '/areas', label: t('area.back') }}
        title={areaLabel({ name: area.name, categoryName: area.category.name })}
        actions={
          <>
            <BigButton
              variant="primary"
              onClick={() => setDialog({ kind: 'payment', mode: { kind: 'new' } })}
            >
              {t('area.recordPayment')}
            </BigButton>
            <LinkButton to={editAreaLink(area.id)}>{t('common.edit')}</LinkButton>
            <BigButton onClick={() => setDialog({ kind: 'delete' })}>
              {t('common.delete')}
            </BigButton>
          </>
        }
      />
      <div className={styles.stack}>
        {notice && (
          <Notice tone="success">
            <div className={styles.saved}>
              <span>{notice}</span>
              {undoable && undoable.receiptNumber !== null && (
                <BigButton disabled={printing.busy} onClick={() => printReceipt(undoable.id)}>
                  {t('print.actions.printReceipt')}
                </BigButton>
              )}
              {undoable && <BigButton onClick={undo}>{t('receipts.undo')}</BigButton>}
            </div>
          </Notice>
        )}
        {problem && <Notice tone="error">{problem}</Notice>}
        {printing.message && <Notice tone={printing.message.tone}>{printing.message.text}</Notice>}

        <AreaFacts area={area} price={price} />

        <div className={styles.actions}>
          <BigButton onClick={() => setDialog({ kind: 'payment', mode: { kind: 'past' } })}>
            {t('area.recordPastPayment')}
          </BigButton>
          <BigButton onClick={() => setDialog({ kind: 'price', mode: 'change' })}>
            {t('area.changePrice')}
          </BigButton>
          {price === 0 ? (
            <BigButton onClick={() => setDialog({ kind: 'price', mode: 'rentAgain' })}>
              {t('area.setRentAgain')}
            </BigButton>
          ) : (
            <BigButton onClick={() => setDialog({ kind: 'price', mode: 'vacant' })}>
              {t('area.markVacant')}
            </BigButton>
          )}
          <BigButton onClick={() => setDialog({ kind: 'renter' })}>
            {t('area.changeRenter')}
          </BigButton>
        </div>

        <AreaPeriod
          area={area}
          period={period}
          currentYear={today.year}
          onEdit={(receipt) => setDialog({ kind: 'payment', mode: { kind: 'edit', receipt } })}
          onCancel={(receipt) => setDialog({ kind: 'cancelReceipt', receipt })}
          onPrint={(receipt) => printReceipt(receipt.id)}
          printing={printing.busy}
          onPickMonth={(box) =>
            void monthPick.pick({
              areaId: area.id,
              currency: area.currency,
              year: period.year,
              box,
            })
          }
        />

        <AreaHistory area={area} />
      </div>

      {monthPick.dialog}
      <PriceDialog
        area={area}
        mode={dialog?.kind === 'price' ? dialog.mode : null}
        onDone={done}
        onClose={() => setDialog(null)}
      />
      <PaymentDialog
        area={area}
        mode={dialog?.kind === 'payment' ? dialog.mode : null}
        onSaved={paymentSaved}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'cancelReceipt'}
        title={t('receipts.cancelTitle')}
        confirmLabel={t('receipts.cancel')}
        cancelLabel={t('receipts.keep')}
        tone="danger"
        onConfirm={() => {
          if (dialog?.kind === 'cancelReceipt') {
            void cancelReceipt(dialog.receipt.id, t('receipts.cancelDone'));
          }
        }}
        onCancel={() => setDialog(null)}
      >
        {t('receipts.cancelBody')}
      </ConfirmDialog>
      <RenterDialog
        area={area}
        open={dialog?.kind === 'renter'}
        onDone={done}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={t('area.deleteTitle')}
        confirmLabel={t('common.delete')}
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setDialog(null)}
      >
        {t('area.deleteBody')}
      </ConfirmDialog>
    </>
  );
}
