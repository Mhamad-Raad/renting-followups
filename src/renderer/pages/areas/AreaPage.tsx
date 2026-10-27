import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { areaLabel, type AreaDetails } from '@shared/areas';
import { yearMonthOf } from '@shared/dates';
import { useIpcQuery } from '../../app/ipc';
import { priceForMonth } from '@shared/prices';
import { flash, useFlashNotice } from '../../app/flash';
import { BigButton } from '../../components/BigButton';
import { LoadError } from '../../components/LoadError';
import { LinkButton } from '../../components/LinkButton';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { AreaFacts } from './AreaFacts';
import { AreaHistory } from './AreaHistory';
import { AreaPeriod } from './AreaPeriod';
import styles from './AreaPage.module.css';
import { AREA_ACTION_PARAM, editAreaLink, isAreaAction } from './links';
import { parseRouteId } from '../../app/parseRouteId';
import { ACTION_DIALOGS, useAreaActions } from './useAreaActions';
import { useAreaPeriod } from './useAreaPeriod';
import { useMonthPick } from './useMonthPick';

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
  const navigate = useNavigate();
  const flashed = useFlashNotice();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.has(AREA_ACTION_PARAM)) void setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const today = yearMonthOf(new Date());
  const price = priceForMonth(area.prices, today);
  const period = useAreaPeriod(area.id, today.year);

  const actions = useAreaActions(area, {
    onChanged: () => {
      onChanged();
      period.refresh();
    },
    onDeleted: (message) => void navigate('/areas', { state: flash(message) }),
    // Opened with an action (Home's "Record payment"): start with its dialog open.
    initialDialog: (() => {
      const action = searchParams.get(AREA_ACTION_PARAM);
      return isAreaAction(action) ? ACTION_DIALOGS[action] : null;
    })(),
    initialNotice: flashed,
  });
  const { open } = actions;

  const monthPick = useMonthPick((outcome) => {
    if (outcome.tone === 'error') {
      actions.fail(outcome.text);
      period.refresh();
      return;
    }
    // A month marked as paid can be undone, like any new payment.
    actions.done(outcome.text, outcome.undo ?? null);
  });

  return (
    <>
      <PageHeader
        back={{ to: '/areas', label: t('area.back') }}
        title={areaLabel({ name: area.name, categoryName: area.category.name })}
        actions={
          <>
            <BigButton variant="primary" onClick={() => open(ACTION_DIALOGS.payment)}>
              {t('area.recordPayment')}
            </BigButton>
            <LinkButton to={editAreaLink(area.id)}>{t('common.edit')}</LinkButton>
            <BigButton onClick={() => open(ACTION_DIALOGS.delete)}>{t('common.delete')}</BigButton>
          </>
        }
      />
      <div className={styles.stack}>
        {actions.feedback}

        <AreaFacts area={area} price={price} />

        <div className={styles.actions}>
          <BigButton onClick={() => open(ACTION_DIALOGS.pastPayment)}>
            {t('area.recordPastPayment')}
          </BigButton>
          <BigButton onClick={() => open(ACTION_DIALOGS.changePrice)}>
            {t('area.changePrice')}
          </BigButton>
          {price === 0 ? (
            <BigButton onClick={() => open(ACTION_DIALOGS.setRentAgain)}>
              {t('area.setRentAgain')}
            </BigButton>
          ) : (
            <BigButton onClick={() => open(ACTION_DIALOGS.markVacant)}>
              {t('area.markVacant')}
            </BigButton>
          )}
          <BigButton onClick={() => open(ACTION_DIALOGS.changeRenter)}>
            {t('area.changeRenter')}
          </BigButton>
        </div>

        <AreaPeriod
          area={area}
          period={period}
          currentYear={today.year}
          onEdit={(receipt) => open({ kind: 'payment', mode: { kind: 'edit', receipt } })}
          onCancel={(receipt) => open({ kind: 'cancelReceipt', receipt })}
          onSavePdf={(receipt) => actions.saveReceiptPdf(receipt.id)}
          saving={actions.saving}
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
      {actions.dialogs}
    </>
  );
}
