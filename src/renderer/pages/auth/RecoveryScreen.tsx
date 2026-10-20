import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkNewPassword, type NewSecretProblem } from '@shared/auth';
import { callIpc } from '../../app/ipc';
import { useNewSecretProblemText, useSecretCheck } from '../../app/useSecretCheck';
import { BigButton } from '../../components/BigButton';
import { Notice } from '../../components/Notice';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import { AuthLayout } from './AuthLayout';

interface RecoveryScreenProps {
  onDone: () => void;
  onBack: () => void;
}

/** "Forgot password?": the recovery phrase lets the owner choose a new password. */
export function RecoveryScreen({ onDone, onBack }: RecoveryScreenProps) {
  const { t } = useTranslation();
  const problemText = useNewSecretProblemText();
  const check = useSecretCheck('phrase');
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<NewSecretProblem | null>(null);

  const submit = async () => {
    if (check.busy || check.waiting) return;
    const found = checkNewPassword(password, again);
    setProblem(found);
    if (found) return;
    const passed = await check.run(() =>
      callIpc('auth:recover', { recoveryPhrase: phrase, newPassword: password }),
    );
    if (passed) onDone();
  };

  return (
    <AuthLayout
      title={t('auth.recover.title')}
      intro={t('auth.recover.intro')}
      onSubmit={() => void submit()}
    >
      <TextField
        label={t('auth.recoveryPhrase')}
        value={phrase}
        onChange={setPhrase}
        autoComplete="off"
        spellCheck={false}
        dir="auto"
        autoFocus
      />
      <PasswordField
        label={t('auth.newPassword')}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        error={problem === 'passwordTooShort' ? problemText(problem) : null}
      />
      <PasswordField
        label={t('auth.newPasswordAgain')}
        value={again}
        onChange={setAgain}
        autoComplete="new-password"
        error={problem === 'passwordsDiffer' ? problemText(problem) : null}
      />
      {check.message && <Notice tone="error">{check.message}</Notice>}
      <BigButton type="submit" variant="primary" disabled={check.busy || check.waiting}>
        {t('auth.recover.submit')}
      </BigButton>
      <BigButton icon="back" onClick={onBack}>
        {t('common.back')}
      </BigButton>
    </AuthLayout>
  );
}
