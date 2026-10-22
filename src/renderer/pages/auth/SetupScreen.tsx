import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkNewPassword, checkNewRecoveryPhrase, type NewSecretProblem } from '@shared/auth';
import { callIpc } from '../../app/ipc';
import { useNewSecretProblemText } from '../../app/useSecretCheck';
import { BigButton } from '../../components/BigButton';
import { Notice } from '../../components/Notice';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import { RestoreOutcomeNotice } from '../settings/RestoreOutcomeNotice';
import { AuthLayout } from './AuthLayout';
import { useRecoveryPhraseHint } from './useRecoveryPhraseHint';

interface SetupScreenProps {
  /** The password was created and the app is now open. */
  onDone: () => void;
  /** A password already exists (another window set it up): show the lock screen. */
  onAlreadySet: () => void;
}

/** First run: create the password (typed twice) and the recovery phrase. */
export function SetupScreen({ onDone, onAlreadySet }: SetupScreenProps) {
  const { t } = useTranslation();
  const problemText = useNewSecretProblemText();
  const phraseHint = useRecoveryPhraseHint();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [phrase, setPhrase] = useState('');
  const [problems, setProblems] = useState<{
    password: NewSecretProblem | null;
    phrase: NewSecretProblem | null;
  }>({ password: null, phrase: null });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    const found = {
      password: checkNewPassword(password, again),
      phrase: checkNewRecoveryPhrase(phrase, password),
    };
    setProblems(found);
    if (found.password || found.phrase) return;
    setBusy(true);
    setFailed(false);
    const result = await callIpc('auth:setup', { password, recoveryPhrase: phrase });
    setBusy(false);
    if (!result.ok) setFailed(true);
    else if (result.data.ok) onDone();
    else onAlreadySet();
  };

  return (
    <AuthLayout
      title={t('auth.setup.title')}
      intro={t('auth.setup.intro')}
      onSubmit={() => void submit()}
    >
      <RestoreOutcomeNotice />
      <PasswordField
        label={t('auth.password')}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        autoFocus
        error={problems.password === 'passwordTooShort' ? problemText(problems.password) : null}
      />
      <PasswordField
        label={t('auth.passwordAgain')}
        value={again}
        onChange={setAgain}
        autoComplete="new-password"
        error={problems.password === 'passwordsDiffer' ? problemText(problems.password) : null}
      />
      <TextField
        label={t('auth.recoveryPhrase')}
        value={phrase}
        onChange={setPhrase}
        autoComplete="off"
        spellCheck={false}
        dir="auto"
        hint={phraseHint}
        error={problemText(problems.phrase)}
      />
      <Notice tone="warning">{t('auth.writeItDown')}</Notice>
      {failed && <Notice tone="error">{t('errors.unexpected')}</Notice>}
      <BigButton type="submit" variant="primary" disabled={busy}>
        {t('auth.setup.submit')}
      </BigButton>
    </AuthLayout>
  );
}
