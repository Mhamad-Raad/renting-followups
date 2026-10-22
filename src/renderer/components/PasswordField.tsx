import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { TextField } from './TextField';
import styles from './TextField.module.css';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  error?: string | null | undefined;
  autoFocus?: boolean;
  /** 'new-password' for fields that create a password, so the browser never pre-fills them. */
  autoComplete?: 'current-password' | 'new-password';
}

/**
 * A password box with an eye button inside it to show what was typed (typing
 * blind is hard for many people) and a warning when Caps Lock is on.
 */
export function PasswordField({
  autoComplete = 'current-password',
  hint,
  ...props
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState('CapsLock'));

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      spellCheck={false}
      dir="auto"
      hint={capsLock ? t('auth.capsLock') : hint}
      onKeyDown={trackCapsLock}
      onKeyUp={trackCapsLock}
      inside={
        <button
          type="button"
          className={styles.iconButton}
          aria-label={visible ? t('auth.hide') : t('auth.show')}
          title={visible ? t('auth.hide') : t('auth.show')}
          aria-pressed={visible}
          onClick={() => setVisible((shown) => !shown)}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      }
    />
  );
}
