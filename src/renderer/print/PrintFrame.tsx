import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../app/SettingsContext';
import styles from './print.module.css';
import { PrintHeader } from './PrintHeader';
import { usePrintLogo } from './PrintLayout';

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
 * in the chosen digits, and the heading with the logo and print title from
 * Settings.
 */
export function PrintFrame({ landscape = false, title, details = [], children }: PrintFrameProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const logo = usePrintLogo();
  const counterStyle = settings.digitStyle === 'arabic' ? ', arabic-indic' : '';
  const pageLabel = JSON.stringify(`${t('print.page')} `);
  return (
    <div className={styles.paper}>
      <style>{`@page {
        size: A4 ${landscape ? 'landscape' : 'portrait'};
        @bottom-center { content: ${pageLabel} counter(page${counterStyle}) " / " counter(pages${counterStyle}); font-size: 9pt; }
      }`}</style>
      <PrintHeader logo={logo} printTitle={settings.printTitle} title={title} details={details} />
      {children}
    </div>
  );
}
