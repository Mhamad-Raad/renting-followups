import type { ReactNode } from 'react';
import { LinkButton } from './LinkButton';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  /** The screen's main button(s), shown on the end side of the header. */
  actions?: ReactNode;
  /** On an inner screen: the screen it was opened from, shown as a back button above the title. */
  back?: { to: string; label: string };
}

/** Answers "where am I?" at the top of every screen. */
export function PageHeader({ title, actions, back }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {back && (
        <div className={styles.back}>
          <LinkButton to={back.to} icon="back">
            {back.label}
          </LinkButton>
        </div>
      )}
      <div className={styles.row}>
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
