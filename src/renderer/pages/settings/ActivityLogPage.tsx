import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityEntry, AuditAction, AuditEntity } from '@shared/audit';
import { formatDateTime, formatYearMonth } from '@shared/dates';
import { formatReceiptNumber } from '@shared/payments';
import { callIpc } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { EmptyState } from '../../components/EmptyState';
import { LinkButton } from '../../components/LinkButton';
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
  const money = (amount: number) =>
    entry.currency && <MoneyText amount={amount} currency={entry.currency} />;
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
      entry.previousAmount !== null && entry.previousAmount !== entry.amount ? (
        <>
          {money(entry.previousAmount)} {t('activity.arrow')} {money(entry.amount)}
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

type Loaded = { status: 'loading' | 'ready' | 'error'; entries: ActivityEntry[]; hasMore: boolean };

/** Settings → Activity log: every recorded change, newest first; read-only. */
export function ActivityLogPage() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [log, setLog] = useState<Loaded>({ status: 'loading', entries: [], hasMore: false });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Adds a page of older entries; the caller shows the loading state first.
  const load = useCallback(async (beforeId: number | null) => {
    const result = await callIpc('activity:list', { beforeId });
    if (!mounted.current) return;
    setLog((current) =>
      result.ok
        ? {
            status: 'ready',
            entries: [...current.entries, ...result.data.entries],
            hasMore: result.data.hasMore,
          }
        : { ...current, status: 'error' },
    );
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const oldest = log.entries.at(-1);
  return (
    <>
      <PageHeader title={t('activity.title')} />
      <div className={styles.stack}>
        <p className={styles.muted}>{t('activity.intro')}</p>
        {log.status === 'error' && <Notice tone="error">{t('errors.unexpected')}</Notice>}
        {log.status === 'ready' && log.entries.length === 0 && (
          <EmptyState title={t('activity.empty')} />
        )}
        {log.entries.length > 0 && (
          <ul className={styles.list}>
            {log.entries.map((entry) => (
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
        <div className={styles.buttonRow}>
          {log.hasMore && oldest && (
            <BigButton
              onClick={() => {
                setLog((current) => ({ ...current, status: 'loading' }));
                void load(oldest.id);
              }}
              disabled={log.status === 'loading'}
            >
              {t('activity.older')}
            </BigButton>
          )}
          <LinkButton to="/settings" icon="back">
            {t('pages.settings.title')}
          </LinkButton>
        </div>
      </div>
    </>
  );
}
