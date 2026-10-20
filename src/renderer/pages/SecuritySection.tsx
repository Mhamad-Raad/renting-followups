import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkNewPassword, checkNewRecoveryPhrase, type NewSecretProblem } from '@shared/auth';
import { callIpc } from '../app/ipc';
import { useNewSecretProblemText, useSecretCheck } from '../app/useSecretCheck';
import { BigButton } from '../components/BigButton';
import { Dialog, DialogActions } from '../components/Dialog';
import { Form } from '../components/Form';
import { Notice } from '../components/Notice';
import { PasswordField } from '../components/PasswordField';
import { TextField } from '../components/TextField';
import { useRecoveryPhraseHint } from './auth/useRecoveryPhraseHint';
import styles from './SettingsPage.module.css';

type Change = 'password' | 'phrase';

interface ChangeFormProps {
  onDone: () => void;
  onCancel: () => void;
}

function ChangePasswordForm({ onDone, onCancel }: ChangeFormProps) {
  const { t } = useTranslation();
  const problemText = useNewSecretProblemText();
  const check = useSecretCheck('password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<NewSecretProblem | null>(null);

  const submit = async () => {
    const found = checkNewPassword(next, again);
    setProblem(found);
    if (found || check.busy || check.waiting) return;
    const passed = await check.run(() =>
      callIpc('auth:changePassword', { currentPassword: current, newPassword: next }),
    );
    if (passed) onDone();
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      <PasswordField
        label={t('auth.currentPassword')}
        value={current}
        onChange={setCurrent}
        autoFocus
      />
      <PasswordField
        label={t('auth.newPassword')}
        value={next}
        onChange={setNext}
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
      <DialogActions>
        <BigButton type="submit" variant="primary" disabled={check.busy || check.waiting}>
          {t('common.save')}
        </BigButton>
        <BigButton onClick={onCancel}>{t('common.cancel')}</BigButton>
      </DialogActions>
    </Form>
  );
}

function ChangeRecoveryPhraseForm({ onDone, onCancel }: ChangeFormProps) {
  const { t } = useTranslation();
  const problemText = useNewSecretProblemText();
  const phraseHint = useRecoveryPhraseHint();
  const check = useSecretCheck('password');
  const [current, setCurrent] = useState('');
  const [phrase, setPhrase] = useState('');
  const [problem, setProblem] = useState<NewSecretProblem | null>(null);

  const submit = async () => {
    const found = checkNewRecoveryPhrase(phrase, current);
    setProblem(found);
    if (found || check.busy || check.waiting) return;
    const passed = await check.run(() =>
      callIpc('auth:changeRecoveryPhrase', { currentPassword: current, newRecoveryPhrase: phrase }),
    );
    if (passed) onDone();
  };

  return (
    <Form className={styles.dialogForm} onSubmit={() => void submit()}>
      <PasswordField
        label={t('auth.currentPassword')}
        value={current}
        onChange={setCurrent}
        autoFocus
      />
      <TextField
        label={t('auth.newRecoveryPhrase')}
        value={phrase}
        onChange={setPhrase}
        autoComplete="off"
        spellCheck={false}
        dir="auto"
        hint={phraseHint}
        error={problemText(problem)}
      />
      <Notice tone="warning">{t('auth.writeItDown')}</Notice>
      {check.message && <Notice tone="error">{check.message}</Notice>}
      <DialogActions>
        <BigButton type="submit" variant="primary" disabled={check.busy || check.waiting}>
          {t('common.save')}
        </BigButton>
        <BigButton onClick={onCancel}>{t('common.cancel')}</BigButton>
      </DialogActions>
    </Form>
  );
}

/** Settings → Security: change the password or the recovery phrase. */
export function SecuritySection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Change | null>(null);
  const [done, setDone] = useState<Change | null>(null);

  const start = (change: Change) => {
    setDone(null);
    setOpen(change);
  };
  const finish = (change: Change) => {
    setOpen(null);
    setDone(change);
  };
  const cancel = () => setOpen(null);

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('settings.security')}</h2>
      {done && (
        <Notice tone="success">
          {t(done === 'password' ? 'settings.passwordChanged' : 'settings.phraseChanged')}
        </Notice>
      )}
      <div className={styles.buttonRow}>
        <BigButton onClick={() => start('password')}>{t('settings.changePassword')}</BigButton>
        <BigButton onClick={() => start('phrase')}>{t('settings.changeRecoveryPhrase')}</BigButton>
      </div>
      <Dialog open={open === 'password'} title={t('settings.changePassword')} onClose={cancel}>
        <ChangePasswordForm onDone={() => finish('password')} onCancel={cancel} />
      </Dialog>
      <Dialog open={open === 'phrase'} title={t('settings.changeRecoveryPhrase')} onClose={cancel}>
        <ChangeRecoveryPhraseForm onDone={() => finish('phrase')} onCancel={cancel} />
      </Dialog>
    </section>
  );
}
