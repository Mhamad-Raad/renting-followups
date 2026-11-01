import type { AreaLines } from '@shared/areas';
import type { CategoryColor } from '@shared/categories';
import styles from './AreaSubline.module.css';
import { CategoryDot } from './CategoryDot';

/**
 * The small line under an area's name in a table (`areaLines`): its address,
 * else its category with the category's dot. Nothing when there is nothing more to say.
 */
export function AreaSubline({ lines, color }: { lines: AreaLines; color: CategoryColor | null }) {
  if (lines.subline === null) return null;
  return (
    <span className={styles.subline} dir={lines.sublineIsCategory ? undefined : 'auto'}>
      {lines.sublineIsCategory && <CategoryDot color={color} />}
      {lines.subline}
    </span>
  );
}
