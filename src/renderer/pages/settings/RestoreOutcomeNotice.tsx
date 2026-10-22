import { useTranslation } from 'react-i18next';
import { formatDate } from '@shared/dates';
import { useIpcQuery } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { Notice } from '../../components/Notice';

/**
 * After a restore the app restarts; the first screen (lock, first-run or
 * damaged-data) says how it went, and which password to use.
 */
export function RestoreOutcomeNotice() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const result = useIpcQuery('restore:result');
  const outcome = result.state.status === 'ready' ? result.state.data : null;
  if (!outcome) return null;
  const date = outcome.madeOn ? formatDate(outcome.madeOn, settings.digitStyle) : '';
  return (
    <Notice tone={outcome.ok ? 'success' : 'error'}>
      {outcome.ok ? t('backup.restoredNotice', { date }) : t('backup.restoreFailed')}
    </Notice>
  );
}
