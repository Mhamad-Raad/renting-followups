import { useId, useState } from 'react';
import { formatPlain } from '@shared/formatNumber';
import { parseInteger } from '@shared/parseNumber';
import { useSettings } from '../app/SettingsContext';
import { BigButton } from './BigButton';
import styles from './CountField.module.css';
import { Icon } from './Icon';

interface CountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  /** The largest count allowed, when known. */
  max?: number | undefined;
  /** Spoken names of the − and + buttons. */
  lessLabel: string;
  moreLabel: string;
  hint?: string | undefined;
}

/**
 * A whole number picked with − and + buttons (or typed, in any digits),
 * kept between `min` and `max`.
 */
export function CountField({
  label,
  value,
  onChange,
  min = 1,
  max,
  lessLabel,
  moreLabel,
  hint,
}: CountFieldProps) {
  const id = useId();
  const { settings } = useSettings();
  const shown = formatPlain(value, settings.digitStyle);
  // While typing, the box may be empty for a moment; it shows the count again on leaving.
  const [text, setText] = useState<string | null>(null);
  const clamp = (count: number) => Math.max(min, max === undefined ? count : Math.min(max, count));
  const type = (raw: string) => {
    setText(raw);
    const parsed = parseInteger(raw);
    if (parsed.ok && parsed.value >= min) onChange(clamp(parsed.value));
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.row}>
        <BigButton
          className={styles.step}
          aria-label={lessLabel}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1))}
        >
          <Icon name="minus" />
        </BigButton>
        <input
          id={id}
          className={styles.input}
          inputMode="numeric"
          value={text ?? shown}
          onChange={(event) => type(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={() => setText(null)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <BigButton
          className={styles.step}
          aria-label={moreLabel}
          disabled={max !== undefined && value >= max}
          onClick={() => onChange(clamp(value + 1))}
        >
          <Icon name="plus" />
        </BigButton>
      </div>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
