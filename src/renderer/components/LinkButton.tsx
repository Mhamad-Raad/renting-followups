import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './BigButton.module.css';
import { Icon, type IconName } from './Icon';

interface LinkButtonProps {
  to: string;
  variant?: 'primary' | 'secondary';
  icon?: IconName;
  children: ReactNode;
}

/** A link to another screen that looks and feels exactly like a big button. */
export function LinkButton({ to, variant = 'secondary', icon, children }: LinkButtonProps) {
  return (
    <Link to={to} className={`${styles.button} ${styles[variant] ?? ''} ${styles.link ?? ''}`}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </Link>
  );
}
