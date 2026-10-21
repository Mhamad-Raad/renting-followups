import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  amountInputText,
  caretAfterSignificant,
  formatAmountInput,
  significantBefore,
} from '@shared/amountInput';
import { FRACTION_DIGITS, type Currency } from '@shared/currency';
import { useSettings } from '../app/SettingsContext';
import { TextField } from './TextField';

interface AmountFieldProps {
  label: string;
  currency: Currency;
  /** Minor units (dinars, or cents for USD), or null while empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string | null | undefined;
  hint?: string | undefined;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * A money box: accepts Western, Arabic-Indic or Persian digits, shows thousands
 * separators while typing, selects its content on focus, and shows the currency.
 */
export function AmountField({
  label,
  currency,
  value,
  onChange,
  error,
  hint,
  disabled,
  autoFocus,
}: AmountFieldProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = FRACTION_DIGITS[currency];
  const [text, setText] = useState(() => amountInputText(value, digits, settings.digitStyle));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);

  // Put the cursor back after the same digit once the re-formatted text is on screen.
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const change = (raw: string) => {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? raw.length;
    const formatted = formatAmountInput(raw, digits, settings.digitStyle);
    if (!formatted) return; // Not part of an amount: keep the previous text.
    pendingCaret.current = caretAfterSignificant(formatted.text, significantBefore(raw, caret));
    setText(formatted.text);
    onChange(formatted.value);
  };

  return (
    <TextField
      label={label}
      value={text}
      onChange={change}
      error={error}
      hint={hint}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      ref={inputRef}
      onFocus={(event) => event.target.select()}
      end={<span aria-hidden="true">{t(`currency.${currency}`)}</span>}
    />
  );
}
