import { useState, type ReactNode } from 'react';
import { LockScreen } from '../pages/auth/LockScreen';
import { RecoveryScreen } from '../pages/auth/RecoveryScreen';
import { SetupScreen } from '../pages/auth/SetupScreen';
import { useIpcQuery } from './ipc';
import { StatusScreen } from './StatusScreen';

/**
 * Shows the app only after the password is entered (or created on first run).
 * The main process enforces the same lock, so this is never the only guard.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, reload, setData } = useIpcQuery('auth:status');
  const [recovering, setRecovering] = useState(false);

  if (state.status === 'loading') return <StatusScreen kind="loading" />;
  if (state.status === 'error') return <StatusScreen kind="error" onRetry={reload} />;

  const unlock = () => setData('unlocked');
  switch (state.data) {
    case 'setup':
      return <SetupScreen onDone={unlock} onAlreadySet={reload} />;
    case 'locked':
      return recovering ? (
        <RecoveryScreen onDone={unlock} onBack={() => setRecovering(false)} />
      ) : (
        <LockScreen onUnlocked={unlock} onForgot={() => setRecovering(true)} />
      );
    case 'unlocked':
      return children;
  }
}
