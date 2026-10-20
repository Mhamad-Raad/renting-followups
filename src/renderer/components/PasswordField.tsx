import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BigButton } from './BigButton';
import { TextField } from './TextField';

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
 * A password box with a Show/Hide button (typing blind is hard for many people)
 * and a warning when Caps Lock is on.
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
      end={
        <BigButton aria-pressed={visible} onClick={() => setVisible((shown) => !shown)}>
          {visible ? t('auth.hide') : t('auth.show')}
        </BigButton>
      }
    />
  );
}
