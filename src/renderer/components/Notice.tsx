import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Notice.module.css';

/** A message waiting to be shown in a Notice, such as the result of a save. */
export interface NoticeMessage {
  tone: 'success' | 'error';
  text: string;
}

interface NoticeProps {
  tone: 'success' | 'warning' | 'error';
  children: ReactNode;
}

/** A plain message box. Errors are announced at once; other messages politely. */
export function Notice({ tone, children }: NoticeProps) {
  return (
    <div
      className={`${styles.notice} ${styles[tone] ?? ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon name={tone === 'success' ? 'check' : 'alert'} />
      <div>{children}</div>
    </div>
  );
}
