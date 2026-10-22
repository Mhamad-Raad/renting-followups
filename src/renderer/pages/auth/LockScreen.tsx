import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@shared/dates';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useSettings } from '../../app/SettingsContext';
import { useSecretCheck } from '../../app/useSecretCheck';
import { BigButton } from '../../components/BigButton';
import { Notice } from '../../components/Notice';
import { PasswordField } from '../../components/PasswordField';
import { AuthLayout } from './AuthLayout';
import styles from './LockScreen.module.css';

interface LockScreenProps {
  onUnlocked: () => void;
  onForgot: () => void;
}

/** Shown on every start: one big password box and one Open button. */
export function LockScreen({ onUnlocked, onForgot }: LockScreenProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  // A new key re-creates the empty box with the cursor in it after a wrong try.
  const [attempt, setAttempt] = useState(0);
  const check = useSecretCheck('password');
  const { settings } = useSettings();
  // After a restore the app restarted on this screen: say how it went, and which password to use.
  const restore = useIpcQuery('restore:result');
  const restored = restore.state.status === 'ready' ? restore.state.data : null;
  const restoredOn = restored?.madeOn ? formatDate(restored.madeOn, settings.digitStyle) : '';

  const submit = async () => {
    if (check.busy || check.waiting || password === '') return;
    const passed = await check.run(() => callIpc('auth:unlock', { password }));
    if (passed) {
      onUnlocked();
      return;
    }
    setPassword('');
    setAttempt((count) => count + 1);
  };

  return (
    <AuthLayout title={t('auth.lock.title')} onSubmit={() => void submit()}>
      {restored && (
        <Notice tone={restored.ok ? 'success' : 'error'}>
          {restored.ok
            ? t('backup.restoredNotice', { date: restoredOn })
            : t('backup.restoreFailed')}
        </Notice>
      )}
      <PasswordField
        key={attempt}
        label={t('auth.password')}
        value={password}
        onChange={setPassword}
        autoFocus
      />
      {check.message && <Notice tone="error">{check.message}</Notice>}
      <BigButton type="submit" variant="primary" disabled={check.busy || check.waiting}>
        {t('auth.lock.submit')}
      </BigButton>
      <BigButton className={styles.forgot} onClick={onForgot}>
        {t('auth.forgot')}
      </BigButton>
    </AuthLayout>
  );
}
