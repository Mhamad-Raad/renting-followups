import type { ButtonHTMLAttributes } from 'react';
import styles from './BigButton.module.css';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'danger';

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
}

/** The app's one button: large, clearly labelled, with gentle press feedback. */
export function BigButton({
  variant = 'secondary',
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: BigButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}
