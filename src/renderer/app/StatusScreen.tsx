import { useTranslation } from 'react-i18next';
import { BigButton } from '../components/BigButton';
import styles from './StatusScreen.module.css';

type StatusScreenProps = { kind: 'loading' } | { kind: 'error'; onRetry: () => void };

/** Full-window message used before the app is ready: while loading, or if loading failed. */
export function StatusScreen(props: StatusScreenProps) {
  const { t } = useTranslation();
  if (props.kind === 'loading') {
    return (
      <div className={`${styles.screen} ${styles.delayed}`} role="status">
        {t('common.loading')}
      </div>
    );
  }
  return (
    <div className={styles.screen} role="alert">
      <p>{t('errors.unexpected')}</p>
      <BigButton variant="primary" onClick={props.onRetry}>
        {t('common.tryAgain')}
      </BigButton>
    </div>
  );
}
