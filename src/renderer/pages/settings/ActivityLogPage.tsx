import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityEntry, AuditAction, AuditEntity } from '@shared/audit';
import { formatDateTime, formatYearMonth } from '@shared/dates';
import { formatReceiptNumber } from '@shared/payments';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { MoneyText } from '../../components/MoneyText';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import type en from '../../i18n/en.json';
import styles from './SettingsList.module.css';

type HeadlineKey = `activity.${keyof typeof en.activity}`;

/** The sentence for each kind of change; anything not listed reads "Changed". */
const HEADLINES: Record<AuditEntity, Partial<Record<AuditAction, HeadlineKey>>> = {
  category: {
    create: 'activity.categoryAdded',
    update: 'activity.categoryEdited',
    delete: 'activity.categoryDeleted',
    restore: 'activity.categoryRestored',
  },
  area: {
    create: 'activity.areaAdded',
    update: 'activity.areaEdited',
    delete: 'activity.areaDeleted',
    restore: 'activity.areaRestored',
    change_price: 'activity.rentChanged',
    change_renter: 'activity.renterChanged',
    end_renter: 'activity.renterLeft',
  },
  receipt: {
    create: 'activity.paymentRecorded',
    update: 'activity.paymentEdited',
    void: 'activity.receiptCancelled',
  },
};

function headlineKey(entry: ActivityEntry): HeadlineKey {
  if (entry.action === 'change_price' && entry.amount === 0) return 'activity.markedVacant';
  return HEADLINES[entry.entity][entry.action] ?? 'activity.changed';
}

/** The small print under a headline: receipt number, month, renter and amounts, where known. */
function EntryDetails({ entry }: { entry: ActivityEntry }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  const money = (amount: number, currency = entry.currency) =>
    currency && <MoneyText amount={amount} currency={currency} />;
  const parts: ReactNode[] = [];
  if (entry.entity === 'receipt') {
    parts.push(
      entry.receiptNumber === null
        ? t('receipts.pastRecord')
        : t('receipts.number', { number: formatReceiptNumber(entry.receiptNumber, digits) }),
    );
  }
  if (entry.month) {
    parts.push(t('activity.fromMonth', { month: formatYearMonth(entry.month, digits) }));
  }
  if (entry.renter) parts.push(<bdi>{entry.renter}</bdi>);
  if (entry.amount !== null && entry.amount > 0) {
    parts.push(
      entry.previousAmount !== null &&
        (entry.previousAmount !== entry.amount || entry.previousCurrency !== entry.currency) ? (
        <>
          {money(entry.previousAmount, entry.previousCurrency)} {t('activity.arrow')}{' '}
          {money(entry.amount)}
        </>
      ) : (
        money(entry.amount)
      ),
    );
  }
  if (parts.length === 0) return null;
  // Each part is its own box with a thin line between them (a dot would look like the
  // Arabic-Indic zero), so neighbouring numbers never run together.
  return (
    <span className={`${styles.muted} ${styles.parts}`}>
      {parts.map((part, index) => (
        <span key={index}>{part}</span>
      ))}
    </span>
  );
}

interface OlderPages {
  entries: ActivityEntry[];
  /** Null until "Show older" has been used; then whether there is still more. */
  hasMore: boolean | null;
  status: 'idle' | 'loading' | 'error';
}

/** Settings → Activity log: every recorded change, newest first; read-only. */
export function ActivityLogPage() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const mounted = useMountedRef();
  // The newest page loads like any other screen data (stale answers are ignored);
  // older pages are added below it, one "Show older" at a time.
  const first = useIpcQuery('activity:list', { beforeId: null });
  const [older, setOlder] = useState<OlderPages>({ entries: [], hasMore: null, status: 'idle' });

  const firstPage = first.state.status === 'ready' ? first.state.data : null;
  const entries = firstPage ? [...firstPage.entries, ...older.entries] : [];
  const hasMore = older.hasMore ?? firstPage?.hasMore ?? false;
  const oldest = entries.at(-1);

  const showOlder = async (beforeId: number) => {
    setOlder((current) => ({ ...current, status: 'loading' }));
    const result = await callIpc('activity:list', { beforeId });
    if (!mounted.current) return;
    setOlder((current) =>
      result.ok
        ? {
            entries: [...current.entries, ...result.data.entries],
            hasMore: result.data.hasMore,
            status: 'idle',
          }
        : { ...current, status: 'error' },
    );
  };

  return (
    <>
      <PageHeader
        title={t('activity.title')}
        back={{ to: '/settings', label: t('pages.settings.title') }}
      />
      <div className={styles.stack}>
        <p className={styles.muted}>{t('activity.intro')}</p>
        {first.state.status === 'error' && <LoadError onRetry={first.reload} />}
        {older.status === 'error' && <Notice tone="error">{t('errors.unexpected')}</Notice>}
        {firstPage && entries.length === 0 && <EmptyState title={t('activity.empty')} />}
        {entries.length > 0 && (
          <ul className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.row}>
                <span className={styles.name}>
                  {t(headlineKey(entry), { name: entry.name ?? t('activity.noName') })}
                </span>
                <EntryDetails entry={entry} />
                <span className={styles.muted}>
                  {formatDateTime(new Date(entry.at), settings.digitStyle)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hasMore && oldest && (
          <div className={styles.buttonRow}>
            <BigButton
              onClick={() => void showOlder(oldest.id)}
              disabled={older.status === 'loading'}
            >
              {t('activity.older')}
            </BigButton>
          </div>
        )}
      </div>
    </>
  );
}
