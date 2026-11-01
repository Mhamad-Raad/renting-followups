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
  /** The new count, or null while the box holds something that is not a count (empty, 0, letters). */
  onChange: (value: number | null) => void;
  min?: number;
  /** The largest count allowed, when known. */
  max?: number | undefined;
  /** Spoken names of the − and + buttons. */
  lessLabel: string;
  moreLabel: string;
  hint?: string | undefined;
  /** Shown under the field and announced; also marks the field as wrong. */
  error?: string | null | undefined;
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
  error,
}: CountFieldProps) {
  const id = useId();
  const { settings } = useSettings();
  const shown = formatPlain(value, settings.digitStyle);
  // What is being typed, until it is left; null shows the count itself.
  const [text, setText] = useState<string | null>(null);
  const clamp = (count: number) => Math.max(min, max === undefined ? count : Math.min(max, count));
  const step = (count: number) => {
    setText(null);
    onChange(clamp(count));
  };
  const type = (raw: string) => {
    const parsed = parseInteger(raw);
    if (!parsed.ok || parsed.value < min) {
      setText(raw);
      onChange(null);
      return;
    }
    const count = clamp(parsed.value);
    // A number above the most allowed shows that most at once, so the box never says one thing and uses another.
    setText(count === parsed.value ? raw : null);
    onChange(count);
  };
  const noteId = `${id}-note`;
  const note = error ?? hint;

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
          onClick={() => step(value - 1)}
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
          onBlur={() => {
            // Leaving an unusable box puts the count back.
            if (text !== null) step(value);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
        />
        <BigButton
          className={styles.step}
          aria-label={moreLabel}
          disabled={max !== undefined && value >= max}
          onClick={() => step(value + 1)}
        >
          <Icon name="plus" />
        </BigButton>
      </div>
      {note && (
        <p id={noteId} className={error ? styles.error : styles.hint}>
          {note}
        </p>
      )}
    </div>
  );
}
