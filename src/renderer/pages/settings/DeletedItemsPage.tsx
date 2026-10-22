import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RestoreResult } from '@shared/areas';
import type { IpcResult } from '@shared/ipc';
import { dateStringFromLocal, formatDate } from '@shared/dates';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { EmptyState } from '../../components/EmptyState';
import { LinkButton } from '../../components/LinkButton';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import styles from './SettingsList.module.css';

interface DeletedRow {
  id: number;
  name: string;
  detail?: string;
  deletedAt: string;
}

/** Settings → Deleted items: everything soft-deleted, each with Restore. */
export function DeletedItemsPage() {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const { settings } = useSettings();
  const deleted = useIpcQuery('deleted:list');
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // Deletion times are stored in UTC; show the local calendar day.
  const deletedOn = (timestamp: string) =>
    t('deletedItems.deletedOn', {
      date: formatDate(dateStringFromLocal(new Date(timestamp)), settings.digitStyle),
    });

  const restore = async (call: () => Promise<IpcResult<RestoreResult>>) => {
    // One restore at a time: a double-click must not send a second one.
    if (restoring) return;
    setRestoring(true);
    const result = await call();
    if (!mounted.current) return;
    setRestoring(false);
    const outcome = result.ok ? result.data : null;
    if (!outcome) setMessage({ tone: 'error', text: t('errors.unexpected') });
    else if (!outcome.ok) setMessage({ tone: 'error', text: t(`deletedItems.${outcome.reason}`) });
    else {
      setMessage({ tone: 'success', text: t('deletedItems.restored') });
      deleted.refresh();
    }
  };

  const section = (title: string, rows: DeletedRow[], onRestore: (id: number) => void) =>
    rows.length > 0 && (
      <section className={styles.section}>
        <h2 className={styles.title}>{title}</h2>
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.row}>
              <span className={styles.name}>{row.name}</span>
              {row.detail && <span className={styles.muted}>{row.detail}</span>}
              <span className={styles.muted}>{deletedOn(row.deletedAt)}</span>
              <BigButton onClick={() => onRestore(row.id)} disabled={restoring}>
                {t('common.restore')}
              </BigButton>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <PageHeader title={t('deletedItems.title')} />
      <div className={styles.stack}>
        <p className={styles.muted}>{t('deletedItems.intro')}</p>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {deleted.state.status === 'error' && <Notice tone="error">{t('errors.unexpected')}</Notice>}
        {deleted.state.status === 'ready' &&
          (deleted.state.data.areas.length + deleted.state.data.categories.length === 0 ? (
            <EmptyState title={t('deletedItems.empty')} />
          ) : (
            <>
              {section(
                t('deletedItems.areas'),
                deleted.state.data.areas.map((area) => ({ ...area, detail: area.categoryName })),
                (id) => void restore(() => callIpc('areas:restore', { id })),
              )}
              {section(
                t('deletedItems.categories'),
                deleted.state.data.categories,
                (id) => void restore(() => callIpc('categories:restore', { id })),
              )}
            </>
          ))}
        <div>
          <LinkButton to="/settings" icon="back">
            {t('pages.settings.title')}
          </LinkButton>
        </div>
      </div>
    </>
  );
}
