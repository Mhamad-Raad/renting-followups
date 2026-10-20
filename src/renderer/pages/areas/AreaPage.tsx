import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { AreaDetails } from '@shared/areas';
import { formatDate, formatYearMonth, yearMonthOf } from '@shared/dates';
import { priceForMonth } from '@shared/prices';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { flash, useFlashNotice } from '../../app/flash';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { CategoryDot } from '../../components/CategoryDot';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LinkButton } from '../../components/LinkButton';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import styles from './AreaPage.module.css';
import { parseAreaId } from './parseAreaId';
import { PriceDialog, type PriceMode } from './PriceDialog';
import { RenterDialog } from './RenterDialog';
import { RentText } from './RentText';

type OpenDialog =
  { kind: 'price'; mode: PriceMode } | { kind: 'renter' } | { kind: 'delete' } | null;

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

  const price = priceForMonth(area.prices, yearMonthOf(new Date()));
  const renter = area.renters.find((entry) => entry.endedOn === null) ?? null;
  const date = (value: string) => formatDate(value, settings.digitStyle);

  const done = (message: string) => {
    setDialog(null);
    setProblem(null);
    setNotice(message);
    onChanged();
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
            <LinkButton to={`/areas/${area.id}/edit`}>{t('common.edit')}</LinkButton>
            <BigButton onClick={() => setDialog({ kind: 'delete' })}>
              {t('common.delete')}
            </BigButton>
          </>
        }
      />
      <div className={styles.stack}>
        {notice && <Notice tone="success">{notice}</Notice>}
        {problem && <Notice tone="error">{problem}</Notice>}

        <section className={styles.card}>
          <dl className={styles.facts}>
            <div>
              <dt>{t('area.rent')}</dt>
              <dd className={styles.big}>
                <RentText price={price} currency={area.currency} />
              </dd>
            </div>
            <div>
              <dt>{t('area.renter')}</dt>
              <dd className={styles.big}>{renter?.fullName ?? t('areas.noRenter')}</dd>
            </div>
            <div>
              <dt>{t('area.phone')}</dt>
              <dd>
                <bdi dir="ltr">{renter?.phone || '—'}</bdi>
              </dd>
            </div>
            <div>
              <dt>{t('area.category')}</dt>
              <dd className={styles.category}>
                <CategoryDot color={area.category.color} />
                {area.category.name}
              </dd>
            </div>
            <div>
              <dt>{t('area.currency')}</dt>
              <dd>{t(`currency.${area.currency}`)}</dd>
            </div>
            {area.address && (
              <div>
                <dt>{t('area.address')}</dt>
                <dd>{area.address}</dd>
              </div>
            )}
            {area.contractStart && (
              <div>
                <dt>{t('area.contractStart')}</dt>
                <dd>{date(area.contractStart)}</dd>
              </div>
            )}
          </dl>
          {area.notes && (
            <div className={styles.notes}>
              <h2 className={styles.label}>{t('area.notes')}</h2>
              <p dir="auto">{area.notes}</p>
            </div>
          )}
        </section>

        <div className={styles.actions}>
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

        <div className={styles.histories}>
          <details className={styles.card} open>
            <summary className={styles.label}>{t('area.priceHistory')}</summary>
            <ul className={styles.history}>
              {[...area.prices].reverse().map((row) => (
                <li key={`${row.year}-${row.month}`}>
                  <span>
                    {t('area.priceFrom', { month: formatYearMonth(row, settings.digitStyle) })}
                  </span>
                  <strong>
                    <RentText price={row.monthlyPrice} currency={area.currency} />
                  </strong>
                </li>
              ))}
            </ul>
          </details>
          <details className={styles.card} open>
            <summary className={styles.label}>{t('area.renterHistory')}</summary>
            {area.renters.length === 0 ? (
              <p className={styles.muted}>{t('areas.noRenter')}</p>
            ) : (
              <ul className={styles.history}>
                {area.renters.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      <strong>{entry.fullName}</strong> <bdi dir="ltr">{entry.phone}</bdi>
                    </span>
                    <span>
                      {entry.endedOn
                        ? t('area.renterPeriod', {
                            from: date(entry.startedOn),
                            to: date(entry.endedOn),
                          })
                        : t('area.renterSinceDate', { from: date(entry.startedOn) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>

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
