import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { AreaDetails } from '@shared/areas';
import { yearMonthOf } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { formatReceiptNumber, type Receipt } from '@shared/payments';
import { priceForMonth } from '@shared/prices';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { flash, useFlashNotice } from '../../app/flash';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LinkButton } from '../../components/LinkButton';
import { MonthBoxes } from '../../components/MonthBoxes';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { AreaFacts } from './AreaFacts';
import { AreaHistory } from './AreaHistory';
import styles from './AreaPage.module.css';
import { parseAreaId } from './parseAreaId';
import { PaymentDialog, type PaymentMode, type PaymentSaved } from './PaymentDialog';
import { PriceDialog, type PriceMode } from './PriceDialog';
import { ReceiptList } from './ReceiptList';
import { RenterDialog } from './RenterDialog';

type OpenDialog =
  | { kind: 'price'; mode: PriceMode }
  | { kind: 'payment'; mode: PaymentMode }
  | { kind: 'cancelReceipt'; receipt: Receipt }
  | { kind: 'renter' }
  | { kind: 'delete' }
  | null;

/** One area: its details, its price and renter history, and the actions that change them. */
export function AreaPage() {
  const { t } = useTranslation();
  const areaId = parseAreaId(useParams().id);
  const area = useIpcQuery('areas:get', { id: areaId ?? 0 });

  if (area.state.status === 'loading') return null;
  if (areaId === null || area.state.status === 'error' || area.state.data === null) {
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
  const { settings } = useSettings();
  const navigate = useNavigate();
  const flashed = useFlashNotice();
  const [notice, setNotice] = useState<string | null>(flashed);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The payment saved last on this screen; it can be undone for as long as the screen is open.
  const [undoable, setUndoable] = useState<PaymentSaved['undo'] | null>(null);

  const today = yearMonthOf(new Date());
  const price = priceForMonth(area.prices, today);
  const months = useIpcQuery('areas:year', { id: area.id, year: today.year });
  const receipts = useIpcQuery('payments:forArea', { areaId: area.id });

  const done = (message: string) => {
    setDialog(null);
    setProblem(null);
    setNotice(message);
    setUndoable(null);
    onChanged();
    months.refresh();
    receipts.refresh();
  };

  const paymentSaved = ({ message, undo }: PaymentSaved) => {
    done(message);
    setUndoable(undo ?? null);
  };

  // Undo and Cancel receipt both cancel the receipt: it stays listed, and its number is never reused.
  const cancelReceipt = async (id: number, message: string) => {
    setDialog(null);
    const result = await callIpc('payments:void', { id });
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
    if (result.ok && result.data.ok) {
      void navigate('/areas', { state: flash(t('areas.deleted')) });
    } else {
      setProblem(t('errors.unexpected'));
    }
  };

  return (
    <>
      <PageHeader
        title={area.name}
        actions={
          <>
            <BigButton
              variant="primary"
              onClick={() => setDialog({ kind: 'payment', mode: { kind: 'new' } })}
            >
              {t('area.recordPayment')}
            </BigButton>
            <LinkButton to={`/areas/${area.id}/edit`}>{t('common.edit')}</LinkButton>
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
              {undoable && <BigButton onClick={undo}>{t('receipts.undo')}</BigButton>}
            </div>
          </Notice>
        )}
        {problem && <Notice tone="error">{problem}</Notice>}

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

        {months.state.status === 'error' && <Notice tone="error">{t('errors.unexpected')}</Notice>}
        {months.state.status === 'ready' && months.state.data && (
          <section className={styles.card}>
            <h2 className={styles.heading}>
              {t('months.title', { year: formatPlain(today.year, settings.digitStyle) })}
            </h2>
            <MonthBoxes
              boxes={months.state.data.boxes}
              year={today.year}
              currency={area.currency}
            />
          </section>
        )}

        <section className={styles.card}>
          <h2 className={styles.heading}>{t('receipts.title')}</h2>
          {receipts.state.status === 'error' && (
            <Notice tone="error">{t('errors.unexpected')}</Notice>
          )}
          {receipts.state.status === 'ready' && (
            <ReceiptList
              receipts={receipts.state.data}
              onEdit={(receipt) => setDialog({ kind: 'payment', mode: { kind: 'edit', receipt } })}
              onCancel={(receipt) => setDialog({ kind: 'cancelReceipt', receipt })}
            />
          )}
        </section>

        <AreaHistory area={area} />

        <div className={styles.back}>
          <LinkButton to="/areas" icon="back">
            {t('area.back')}
          </LinkButton>
        </div>
      </div>

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
