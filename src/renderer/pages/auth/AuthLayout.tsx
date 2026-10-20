import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Form } from '../../components/Form';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  title: string;
  intro?: string;
  onSubmit: () => void;
  children: ReactNode;
}

/** The centred card shared by the setup, lock and recovery screens. Enter submits its form. */
export function AuthLayout({ title, intro, onSubmit, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <main className={styles.screen}>
      <Form className={styles.card} onSubmit={onSubmit}>
        <p className={styles.appName}>{t('app.name')}</p>
        <h1 className={styles.title}>{title}</h1>
        {intro && <p className={styles.intro}>{intro}</p>}
        {children}
      </Form>
    </main>
  );
}
