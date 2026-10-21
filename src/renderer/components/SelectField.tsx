import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import styles from './TextField.module.css';

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null | undefined;
  hint?: string | undefined;
  children: ReactNode;
}

/** A large labelled drop-down list, styled like the text boxes. */
export function SelectField({
  label,
  value,
  onChange,
  error,
  hint,
  children,
  ...props
}: SelectFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        {...props}
      >
        {children}
      </select>
      {note && (
        <p id={noteId} className={error ? styles.error : styles.hint}>
          {note}
        </p>
      )}
    </div>
  );
}
