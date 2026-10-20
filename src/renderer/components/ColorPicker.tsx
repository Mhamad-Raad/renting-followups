import { useId } from 'react';
import { CATEGORY_COLORS, type CategoryColor } from '@shared/categories';
import styles from './ColorPicker.module.css';
import { Icon } from './Icon';

interface ColorPickerProps {
  label: string;
  noColorLabel: string;
  value: CategoryColor | null;
  onChange: (value: CategoryColor | null) => void;
}

/** Large colour swatches built on radio buttons; the chosen one shows a tick, not only a border. */
export function ColorPicker({ label, noColorLabel, value, onChange }: ColorPickerProps) {
  const name = useId();
  const options: (CategoryColor | null)[] = [null, ...CATEGORY_COLORS];
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.swatches}>
        {options.map((color) => (
          <label
            key={color ?? 'none'}
            className={color ? styles.swatch : `${styles.swatch} ${styles.none}`}
            style={color ? { backgroundColor: color } : undefined}
            title={color ? undefined : noColorLabel}
          >
            <input
              type="radio"
              name={name}
              checked={value === color}
              onChange={() => onChange(color)}
              aria-label={color ?? noColorLabel}
            />
            {value === color && <Icon name="check" className={styles.tick} />}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
