import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../app/SettingsContext';
import styles from './print.module.css';

interface PrintFrameProps {
  landscape?: boolean;
  /** The report or receipt title, under the owner's print title. */
  title: string;
  /** Short lines under the title, such as the filters used and the date. */
  details?: readonly string[];
  children: ReactNode;
}

/**
 * The frame of every printed page: paper size and orientation, page numbers
 * in the chosen digits, and the heading. The print title and logo from
 * Settings arrive in iteration 10; until then the app name is used.
 */
export function PrintFrame({ landscape = false, title, details = [], children }: PrintFrameProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const counterStyle = settings.digitStyle === 'arabic' ? ', arabic-indic' : '';
  const pageLabel = JSON.stringify(`${t('print.page')} `);
  return (
    <div className={styles.paper}>
      <style>{`@page {
        size: A4 ${landscape ? 'landscape' : 'portrait'};
        @bottom-center { content: ${pageLabel} counter(page${counterStyle}) " / " counter(pages${counterStyle}); font-size: 9pt; }
      }`}</style>
      <header className={styles.header}>
        <p className={styles.owner}>{t('app.name')}</p>
        <h1 className={styles.title}>{title}</h1>
        {details.map((line) => (
          <p key={line} className={styles.detail}>
            {line}
          </p>
        ))}
      </header>
      {children}
    </div>
  );
}
