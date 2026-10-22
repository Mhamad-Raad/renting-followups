import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NoticeMessage } from '../components/Notice';
import { callIpc } from './ipc';
import { useMountedRef } from './useMountedRef';

/**
 * Back up now, with its plain result message. The message lives in the
 * component that calls this hook, so it stays visible even when the backup
 * reminder that offered the button disappears (because the backup was made).
 */
export function useBackupNow(onDone?: () => void) {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<NoticeMessage | null>(null);

  const backUp = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    const answer = await callIpc('backup:now');
    if (!mounted.current) return;
    setBusy(false);
    const outcome = answer.ok ? answer.data : null;
    if (!outcome || !outcome.ok) {
      setMessage({ tone: 'error', text: t(`backup.problems.${outcome?.reason ?? 'failed'}`) });
    } else if (outcome.done === 'saved') {
      setMessage({ tone: 'success', text: t('backup.saved', { file: outcome.fileName }) });
    }
    onDone?.();
  }, [mounted, onDone, t]);

  return { busy, message, setMessage, backUp };
}
