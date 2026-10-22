import { useId } from 'react';
import styles from './SwatchPicker.module.css';
import { Icon } from './Icon';

export interface Swatch<T> {
  value: T;
  /** Any CSS colour, including a variable; null draws an empty dashed box ("no colour"). */
  color: string | null;
  /** The colour of the tick drawn on the swatch; white by default. */
  tickColor?: string;
  /** Read aloud and shown on hover, since a colour alone says nothing to a screen reader. */
  label: string;
}

interface SwatchPickerProps<T> {
  label: string;
  value: T;
  swatches: readonly Swatch<T>[];
  onChange: (value: T) => void;
}

/** Large colour swatches built on radio buttons; the chosen one shows a tick, not only a border. */
export function SwatchPicker<T extends string | null>({
  label,
  value,
  swatches,
  onChange,
}: SwatchPickerProps<T>) {
  const name = useId();
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.swatches}>
        {swatches.map((swatch) => (
          <label
            key={swatch.value ?? 'none'}
            className={swatch.color ? styles.swatch : `${styles.swatch} ${styles.none}`}
            style={
              swatch.color ? { backgroundColor: swatch.color, color: swatch.tickColor } : undefined
            }
            title={swatch.label}
          >
            <input
              type="radio"
              name={name}
              checked={value === swatch.value}
              onChange={() => onChange(swatch.value)}
              aria-label={swatch.label}
            />
            {value === swatch.value && <Icon name="check" className={styles.tick} />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
