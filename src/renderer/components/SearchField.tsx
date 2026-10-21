import styles from './SearchField.module.css';

interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}

/** A big search box; the label is also its placeholder so the purpose is always visible. */
export function SearchField({ label, value, onChange, maxLength }: SearchFieldProps) {
  return (
    <input
      type="search"
      className={styles.search}
      aria-label={label}
      placeholder={label}
      value={value}
      maxLength={maxLength}
      dir="auto"
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
