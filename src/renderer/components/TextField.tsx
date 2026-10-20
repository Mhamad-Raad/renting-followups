import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import styles from './TextField.module.css';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Plain help shown under the field. */
  hint?: string | undefined;
  /** Shown under the field and announced; also marks the field as wrong. */
  error?: string | null | undefined;
  /** Something placed at the end of the field, such as a Show/Hide button or a currency. */
  end?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** A large labelled text box with room for a hint or an error underneath. */
export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  end,
  ref,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.row}>
        <input
          ref={ref}
          id={id}
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          data-autofocus={inputProps.autoFocus ? true : undefined}
          {...inputProps}
        />
        {end && <div className={styles.end}>{end}</div>}
      </div>
      {note && (
        <p id={noteId} className={error ? styles.error : styles.hint}>
          {note}
        </p>
      )}
    </div>
  );
}
