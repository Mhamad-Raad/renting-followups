import { useTranslation } from 'react-i18next';
import { BigButton } from './BigButton';
import { Notice } from './Notice';
import styles from './LoadError.module.css';

/** Shown when a screen's information could not be loaded: a plain message and Try again. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={styles.loadError}>
      <Notice tone="error">{t('errors.unexpected')}</Notice>
      <BigButton onClick={onRetry}>{t('common.tryAgain')}</BigButton>
    </div>
  );
}
