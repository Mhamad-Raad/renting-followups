import styles from './Checkbox.module.css';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The label is read out but not shown, for a box whose meaning is clear from its row. */
  hideLabel?: boolean;
}

/** A large checkbox with its label as part of the click area. */
export function Checkbox({ label, checked, onChange, hideLabel = false }: CheckboxProps) {
  return (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={hideLabel ? styles.hidden : undefined}>{label}</span>
    </label>
  );
}
