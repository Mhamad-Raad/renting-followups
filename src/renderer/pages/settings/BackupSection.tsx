import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@shared/dates';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { Notice } from '../../components/Notice';
import { RestoreButton } from './RestoreButton';
import styles from './SettingsPage.module.css';

interface Message {
  tone: 'success' | 'error';
  text: string;
}

/** Settings → Backup: the folder, Back up now, the last backup's date, and Restore. */
export function BackupSection() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const mounted = useMountedRef();
  const status = useIpcQuery('backup:status');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const info = status.state.status === 'ready' ? status.state.data : null;

  const run = async (work: () => Promise<Message | null>) => {
    setBusy(true);
    setMessage(null);
    const result = await work();
    if (!mounted.current) return;
    setBusy(false);
    setMessage(result);
    status.refresh();
  };

  const backUpNow = () =>
    run(async () => {
      const result = await callIpc('backup:now');
      const outcome = result.ok ? result.data : null;
      if (!outcome || !outcome.ok) {
        return { tone: 'error', text: t(`backup.problems.${outcome?.reason ?? 'failed'}`) };
      }
      return outcome.done === 'saved'
        ? { tone: 'success', text: t('backup.saved', { file: outcome.fileName }) }
        : null;
    });

  const chooseFolder = () =>
    run(async () => {
      const result = await callIpc('backup:chooseFolder');
      return result.ok ? null : { tone: 'error', text: t('settings.saveFailed') };
    });

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('backup.title')}</h2>
      <p className={styles.hint}>{t('backup.intro')}</p>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {info && (
        <>
          <div className={styles.column}>
            <span className={styles.label}>{t('backup.folder')}</span>
            {info.folder ? (
              <bdi dir="ltr" className={styles.path}>
                {info.folder}
              </bdi>
            ) : (
              <span className={styles.hint}>{t('backup.noFolder')}</span>
            )}
            {info.folderMissing && <Notice tone="warning">{t('backup.folderMissing')}</Notice>}
            {info.sameDrive && <Notice tone="warning">{t('backup.sameDrive')}</Notice>}
          </div>
          <p>
            {info.lastBackupOn
              ? t('backup.lastBackup', { date: formatDate(info.lastBackupOn, settings.digitStyle) })
              : t('backup.never')}
          </p>
          <div className={styles.buttonRow}>
            <BigButton variant="primary" onClick={() => void backUpNow()} disabled={busy}>
              {t('backup.now')}
            </BigButton>
            <BigButton onClick={() => void chooseFolder()} disabled={busy}>
              {t(info.folder ? 'backup.changeFolder' : 'backup.chooseFolder')}
            </BigButton>
          </div>
        </>
      )}
      {status.state.status === 'error' && <Notice tone="error">{t('errors.unexpected')}</Notice>}
      <h3 className={styles.label}>{t('backup.restoreTitle')}</h3>
      <p className={styles.hint}>{t('backup.restoreIntro')}</p>
      <RestoreButton />
    </section>
  );
}
