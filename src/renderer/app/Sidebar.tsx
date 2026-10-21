import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { formatPlain } from '@shared/formatNumber';
import { Icon } from '../components/Icon';
import { NAV_ITEMS } from './routes';
import { useSettings } from './SettingsContext';
import { useReminders } from './useReminders';
import styles from './Sidebar.module.css';

/** The fixed, always-visible main menu on the start side of the window. */
export function Sidebar() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const reminders = useReminders();
  const count = reminders.state.status === 'ready' ? reminders.state.data.length : 0;
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
              <span className={styles.icon}>
                <Icon name={item.icon} />
                {item.key === 'notifications' && count > 0 && (
                  // Keyed by the count, so the soft pulse plays once each time it changes.
                  <span
                    key={count}
                    className={styles.badge}
                    aria-label={t('notifications.count', {
                      number: formatPlain(count, settings.digitStyle),
                    })}
                  >
                    {formatPlain(count, settings.digitStyle)}
                  </span>
                )}
              </span>
              <span>{t(`nav.${item.key}`)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
