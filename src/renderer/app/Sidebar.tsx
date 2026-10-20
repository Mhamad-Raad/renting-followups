import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { Icon } from '../components/Icon';
import { NAV_ITEMS } from './routes';
import styles from './Sidebar.module.css';

/** The fixed, always-visible main menu on the start side of the window. */
export function Sidebar() {
  const { t } = useTranslation();
  return (
    <nav className={styles.sidebar} aria-label={t('nav.label')}>
      <p className={styles.appName}>{t('app.name')}</p>
      <ul className={styles.list}>
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              <Icon name={item.icon} />
              <span>{t(`nav.${item.key}`)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
