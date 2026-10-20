import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  /** The screen's main button(s), shown on the end side of the header. */
  actions?: ReactNode;
}

/** Answers "where am I?" at the top of every screen. */
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
