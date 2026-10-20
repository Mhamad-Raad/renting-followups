import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MIN_PASSWORD_LENGTH,
  MIN_RECOVERY_PHRASE_LENGTH,
  type NewSecretProblem,
  type SecretCheckResult,
} from '@shared/auth';
import { formatPlain } from '@shared/formatNumber';
import type { IpcErrorCode, IpcResult } from '@shared/ipc';
import { useSettings } from './SettingsContext';

type Problem = { kind: 'wrong'; attemptsLeft: number } | { kind: 'error'; code: IpcErrorCode };

const COUNTDOWN_TICK_MS = 250;

/** Plain text for a problem with a new password or recovery phrase. */
export function useNewSecretProblemText() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return useCallback(
    (problem: NewSecretProblem | null): string | null => {
      if (!problem) return null;
      const min = problem === 'phraseTooShort' ? MIN_RECOVERY_PHRASE_LENGTH : MIN_PASSWORD_LENGTH;
      return t(`auth.problems.${problem}`, { min: formatPlain(min, settings.digitStyle) });
    },
    [t, settings.digitStyle],
  );
}

/**
 * Runs a password or recovery-phrase check and explains the outcome in plain
 * words: tries left, or a live countdown during the 30-second wait. While
 * busy or waiting, the form's button should be disabled.
 */
export function useSecretCheck(secret: 'password' | 'phrase') {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (waitUntil === null) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= waitUntil) setWaitUntil(null);
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [waitUntil]);

  const secondsLeft = waitUntil === null ? 0 : Math.max(0, Math.ceil((waitUntil - now) / 1000));

  /** Returns true when the check passed. */
  const run = useCallback(
    async (call: () => Promise<IpcResult<SecretCheckResult>>): Promise<boolean> => {
      setBusy(true);
      setProblem(null);
      const result = await call();
      if (!mounted.current) return false;
      setBusy(false);
      if (!result.ok) {
        setProblem({ kind: 'error', code: result.error });
        return false;
      }
      const check = result.data;
      if (check.ok) return true;
      if (check.reason === 'wait') {
        const current = Date.now();
        setNow(current);
        setWaitUntil(current + check.waitSeconds * 1000);
      } else {
        setProblem({ kind: 'wrong', attemptsLeft: check.attemptsLeft });
      }
      return false;
    },
    [],
  );

  const format = (value: number) => formatPlain(value, settings.digitStyle);
  let message: string | null = null;
  if (secondsLeft > 0) message = t('auth.wait', { seconds: format(secondsLeft) });
  else if (problem?.kind === 'wrong') {
    message = t(secret === 'password' ? 'auth.wrongPassword' : 'auth.wrongPhrase', {
      tries: format(problem.attemptsLeft),
    });
  } else if (problem?.kind === 'error') message = t(`errors.${problem.code}`);

  return { busy, waiting: secondsLeft > 0, message, run };
}
