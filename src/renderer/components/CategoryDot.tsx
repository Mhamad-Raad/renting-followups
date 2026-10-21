import type { CategoryColor } from '@shared/categories';
import styles from './CategoryDot.module.css';

/** The small colour mark of a category; categories without a colour show an outlined dot. */
export function CategoryDot({ color }: { color: CategoryColor | null }) {
  return (
    <span
      className={color ? styles.dot : `${styles.dot} ${styles.none}`}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden="true"
    />
  );
}
