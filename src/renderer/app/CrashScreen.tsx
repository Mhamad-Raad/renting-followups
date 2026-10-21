import { useTranslation } from 'react-i18next';
import { BigButton } from '../components/BigButton';
import { Icon } from '../components/Icon';
import { isPrintPage, usePrintReady } from '../print/printPage';
import styles from './CrashScreen.module.css';

interface CrashScreenProps {
  onGoBack: () => void;
}

/** "Something went wrong. Your data is safe." with one way out. */
export function CrashScreen({ onGoBack }: CrashScreenProps) {
  const { t } = useTranslation();
  // A crashed print page says so at once, so the owner is not kept waiting for the time limit.
  usePrintReady(isPrintPage() ? false : null);
  return (
    <div className={styles.screen} role="alert">
      <Icon name="alert" className={styles.icon} />
      <h1 className={styles.title}>{t('crash.title')}</h1>
      <p className={styles.body}>{t('crash.body')}</p>
      <BigButton variant="primary" icon="back" onClick={onGoBack}>
        {t('crash.goBack')}
      </BigButton>
    </div>
  );
}
