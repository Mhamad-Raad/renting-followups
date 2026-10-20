import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import styles from './PlaceholderPage.module.css';

interface PlaceholderPageProps {
  page: 'home' | 'areas' | 'reports' | 'notifications';
}

/** Stands in for screens that are built in later iterations. */
export function PlaceholderPage({ page }: PlaceholderPageProps) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t(`pages.${page}.title`)} />
      <p className={styles.message}>{t('pages.comingSoon')}</p>
    </>
  );
}
