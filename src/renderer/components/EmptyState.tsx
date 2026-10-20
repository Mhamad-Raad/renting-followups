import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  body?: string;
  /** The one obvious next step, usually a big button. */
  action?: ReactNode;
}

/** One large, friendly message when there is nothing to show yet. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>{title}</h2>
      {body && <p className={styles.body}>{body}</p>}
      {action}
    </div>
  );
}
