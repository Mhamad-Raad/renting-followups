import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FONT_NAMES } from '@shared/fonts';
import { useSettings } from '../app/SettingsContext';
import { LANGUAGE_DIRECTION } from '../i18n';
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
  // The page margin has no direction of its own: the whole line is isolated in the
  // language's direction, and each number on its own, so "Page 2 / 19" never reads 19 / 2.
  const [start, end] =
    LANGUAGE_DIRECTION[settings.language] === 'rtl' ? ['\\2067', '\\2069'] : ['\\2066', '\\2069'];
  const number = (counter: string) => `"\\2066" counter(${counter}${counterStyle}) "\\2069"`;
  const pageNumbers = [
    `"${start}"`,
    JSON.stringify(`${t('print.page')} `),
    number('page'),
    '" / "',
    number('pages'),
    `"${end}"`,
  ].join(' ');
  return (
    <div className={styles.paper}>
      <style>{`@page {
        size: A4 ${landscape ? 'landscape' : 'portrait'};
        @bottom-center { content: ${pageNumbers}; font-family: "${FONT_NAMES[settings.fontFamily]}", sans-serif; font-size: 9pt; }
      }`}</style>
      <PrintHeader logo={logo} printTitle={settings.printTitle} title={title} details={details} />
      {children}
    </div>
  );
}
