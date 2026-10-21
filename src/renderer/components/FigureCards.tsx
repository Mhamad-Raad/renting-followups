import type { ReactNode } from 'react';
import styles from './FigureCards.module.css';

export interface Figure {
  label: string;
  value: ReactNode;
  /** Draws attention to a figure, such as money still owed. */
  tone?: 'normal' | 'warning';
}

/** A row of large labelled figures, such as Received and Still owed. */
export function FigureCards({ figures }: { figures: readonly Figure[] }) {
  return (
    <dl className={styles.cards}>
      {figures.map((figure) => (
        <div key={figure.label} className={styles.card} data-tone={figure.tone ?? 'normal'}>
          <dt className={styles.label}>{figure.label}</dt>
          <dd className={styles.value}>{figure.value}</dd>
        </div>
      ))}
    </dl>
  );
}
