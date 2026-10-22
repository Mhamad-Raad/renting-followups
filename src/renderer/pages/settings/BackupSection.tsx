import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BACKUPS_KEPT } from '@shared/backup';
import { formatDate } from '@shared/dates';
import { formatPlain } from '@shared/formatNumber';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useBackupNow } from '../../app/useBackupNow';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { Notice } from '../../components/Notice';
import { RestoreButton } from './RestoreButton';
import styles from './SettingsPage.module.css';

/** Settings → Backup: the folder, Back up now, the last backup's date, and Restore. */
export function BackupSection() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const mounted = useMountedRef();
  const status = useIpcQuery('backup:status');
  const backupNow = useBackupNow(status.refresh);
  const { message, setMessage } = backupNow;
  const [choosing, setChoosing] = useState(false);
  const busy = backupNow.busy || choosing;
  const info = status.state.status === 'ready' ? status.state.data : null;

  const chooseFolder = async () => {
    setChoosing(true);
    setMessage(null);
    const result = await callIpc('backup:chooseFolder');
    if (!mounted.current) return;
    setChoosing(false);
    if (!result.ok) setMessage({ tone: 'error', text: t('settings.saveFailed') });
    status.refresh();
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('backup.title')}</h2>
      <p className={styles.hint}>
        {t('backup.intro', { number: formatPlain(BACKUPS_KEPT, settings.digitStyle) })}
      </p>
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
            {info.folderMissing && (
              <Notice tone="warning">{t('backup.problems.folder_missing')}</Notice>
            )}
            {info.sameDrive && <Notice tone="warning">{t('backup.sameDrive')}</Notice>}
          </div>
          <p>
            {info.lastBackupOn
              ? t('backup.lastBackup', { date: formatDate(info.lastBackupOn, settings.digitStyle) })
              : t('backup.never')}
          </p>
          <div className={styles.buttonRow}>
            <BigButton variant="primary" onClick={() => void backupNow.backUp()} disabled={busy}>
              {t('backup.now')}
            </BigButton>
            <BigButton onClick={() => void chooseFolder()} disabled={busy}>
              {t(info.folder ? 'backup.changeFolder' : 'backup.chooseFolder')}
            </BigButton>
          </div>
        </>
      )}
      {status.state.status === 'loading' && <p className={styles.hint}>{t('common.loading')}</p>}
      {status.state.status === 'error' && <Notice tone="error">{t('errors.unexpected')}</Notice>}
      <h3 className={styles.label}>{t('backup.restoreTitle')}</h3>
      <p className={styles.hint}>{t('backup.restoreIntro')}</p>
      <RestoreButton />
    </section>
  );
}
