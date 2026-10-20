import { useId } from 'react';
import styles from './ChoiceGroup.module.css';
import { Icon } from './Icon';

interface Choice<T extends string> {
  value: T;
  label: string;
  /** For labels written in another language than the screen, such as language names. */
  lang?: string;
  /** Forces left-to-right order, for labels such as "1 2 3" that must not be reversed in RTL. */
  ltr?: boolean;
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}

/**
 * A row of large option buttons for picking one value. Built on real radio
 * buttons, so arrow keys, Tab and screen readers work as expected.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
}: ChoiceGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.choices}>
        {choices.map((choice) => (
          <label key={choice.value} className={styles.choice} lang={choice.lang}>
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={choice.value === value}
              onChange={() => onChange(choice.value)}
            />
            {choice.value === value && <Icon name="check" className={styles.tick} />}
            {choice.ltr ? <bdi dir="ltr">{choice.label}</bdi> : <span>{choice.label}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
