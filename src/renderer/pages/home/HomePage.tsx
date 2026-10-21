import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { formatPlain } from '@shared/formatNumber';
import type { AttentionItem, CurrencyTotals } from '@shared/home';
import { flash } from '../../app/flash';
import { useIpcQuery } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { CategoryDot } from '../../components/CategoryDot';
import { EmptyState } from '../../components/EmptyState';
import { FigureCards } from '../../components/FigureCards';
import { LinkButton } from '../../components/LinkButton';
import { MoneyText } from '../../components/MoneyText';
import { StatusPill } from '../../components/MonthBoxes';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { PhoneText } from '../../components/PhoneText';
import { areaLink, recordPaymentLink } from '../areas/links';
import styles from './HomePage.module.css';

/** The start screen: this year's money per currency and the areas that need attention now. */
export function HomePage() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const summary = useIpcQuery('home:summary');

  const header = (
    <PageHeader
      title={t('pages.home.title')}
      actions={
        <>
          <BigButton
            onClick={() => void navigate('/areas', { state: flash(t('home.chooseArea')) })}
          >
            {t('area.recordPayment')}
          </BigButton>
          <LinkButton to="/areas/new" variant="primary">
            {t('areas.add')}
          </LinkButton>
        </>
      }
    />
  );

  if (summary.state.status === 'loading') return header;
  if (summary.state.status === 'error') {
    return (
      <>
        {header}
        <Notice tone="error">{t('errors.unexpected')}</Notice>
      </>
    );
  }
  const { year, totals, attention } = summary.state.data;
  if (totals.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title={t('areas.empty.title')}
          body={t('areas.empty.body')}
          action={
            <LinkButton to="/areas/new" variant="primary">
              {t('areas.empty.button')}
            </LinkButton>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className={styles.stack}>
        <section className={styles.section}>
          <h2 className={styles.heading}>
            {t('home.cardsTitle', { year: formatPlain(year, settings.digitStyle) })}
          </h2>
          {totals.map((total) => (
            <CurrencyCards key={total.currency} total={total} />
          ))}
          <p className={styles.footnote}>{t('home.remainingHint')}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>{t('home.attention')}</h2>
          {attention.length === 0 ? (
            <Notice tone="success">{t('home.attentionNone')}</Notice>
          ) : (
            <ul className={styles.list} aria-label={t('home.attention')}>
              {attention.map((item) => (
                <AttentionRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function CurrencyCards({ total }: { total: CurrencyTotals }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return (
    <FigureCards
      figures={[
        {
          label: t('home.received'),
          value: <MoneyText amount={total.received} currency={total.currency} />,
        },
        {
          label: t('home.remaining'),
          value: <MoneyText amount={total.remaining} currency={total.currency} />,
          tone: total.remaining > 0 ? 'warning' : 'normal',
        },
        {
          label: `${t('home.lateAreas')} · ${t(`currency.${total.currency}`)}`,
          value: formatPlain(total.lateAreas, settings.digitStyle),
          tone: total.lateAreas > 0 ? 'warning' : 'normal',
        },
      ]}
    />
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { standing } = item;
  return (
    <li className={styles.row}>
      <div className={styles.who}>
        <Link to={areaLink(item.id)} className={styles.name}>
          {item.name}
        </Link>
        <span className={styles.second}>
          <CategoryDot color={item.categoryColor} />
          {item.categoryName}
        </span>
      </div>
      <div className={styles.who}>
        <span>{item.renterName ?? t('areas.noRenter')}</span>
        {item.renterPhone && (
          <span className={styles.second}>
            <PhoneText phone={item.renterPhone} />
          </span>
        )}
      </div>
      <div className={styles.owed}>
        <strong>
          {t('home.owes')} <MoneyText amount={standing.owed} currency={item.currency} />
        </strong>
        {standing.lateMonths > 0 ? (
          <StatusPill status="late">
            {t('home.lateMonths', {
              number: formatPlain(standing.lateMonths, settings.digitStyle),
            })}
          </StatusPill>
        ) : (
          <StatusPill status="due">{t('home.dueNow')}</StatusPill>
        )}
      </div>
      <BigButton variant="primary" onClick={() => void navigate(recordPaymentLink(item.id))}>
        {t('area.recordPayment')}
      </BigButton>
    </li>
  );
}
