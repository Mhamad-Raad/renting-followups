import type { ReactNode } from 'react';
import type { Currency } from '@shared/currency';
import styles from './PerCurrency.module.css';

/**
 * One line per currency: almost always one, two in the year a new renter
 * started paying in another currency. Amounts in different currencies are
 * shown apart and never added together.
 */
export function PerCurrency<T extends { currency: Currency }>({
  items,
  children,
}: {
  items: readonly T[];
  children: (item: T) => ReactNode;
}) {
  const [only] = items;
  if (only && items.length === 1) return <>{children(only)}</>;
  return (
    <span className={styles.lines}>
      {items.map((item) => (
        <span key={item.currency}>{children(item)}</span>
      ))}
    </span>
  );
}
