import { useTranslation } from 'react-i18next';
import { RestoreButton } from '../settings/RestoreButton';
import { RestoreOutcomeNotice } from '../settings/RestoreOutcomeNotice';
import { AuthLayout } from './AuthLayout';

/**
 * Shown instead of the lock screen when the data file is damaged
 * (ARCHITECTURE.md section 15). Nothing has been changed; the only way on is
 * Restore from backup, which keeps the damaged file in the safety copies.
 */
export function DamagedScreen() {
  const { t } = useTranslation();
  return (
    <AuthLayout
      title={t('backup.damaged.title')}
      intro={t('backup.damaged.intro')}
      onSubmit={() => {}}
    >
      <RestoreOutcomeNotice />
      <RestoreButton primary />
      <p>{t('backup.damaged.noBackup')}</p>
    </AuthLayout>
  );
}
