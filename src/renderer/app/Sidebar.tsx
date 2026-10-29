import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { formatPlain } from '@shared/formatNumber';
import { Icon } from '../components/Icon';
import { NAV_ITEMS } from './routes';
import { useSettings } from './SettingsContext';
import { useReminders } from './useReminders';
import styles from './Sidebar.module.css';
import logo from '../../../resources/icon.png';

/** Above this the bell shows "99+", so the number never covers the bell; the page shows the exact count. */
const BADGE_MAX = 99;

/**
 * The fixed, always-visible main menu on the start side of the window: each
 * page as an icon with its name written under it, so nothing is hidden and
 * there is nothing to open. Settings sits apart at the bottom.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const reminders = useReminders();
  const count = reminders.state.status === 'ready' ? reminders.state.data.length : 0;
  return (
    <nav
      // `app-sidebar` lets Settings → Sidebar: Dark give it its own colours (themes.css).
      className={`app-sidebar ${styles.sidebar}`}
      aria-label={t('nav.label')}
    >
      <img src={logo} alt={t('app.name')} title={t('app.name')} className={styles.logo} />
      <ul className={styles.list}>
        {NAV_ITEMS.map((item) => (
          <li key={item.path} className={item.key === 'settings' ? styles.last : undefined}>
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
                  <span key={count} className={styles.badge} aria-hidden="true">
                    {count > BADGE_MAX
                      ? `${formatPlain(BADGE_MAX, settings.digitStyle)}+`
                      : formatPlain(count, settings.digitStyle)}
                  </span>
                )}
              </span>
              <span className={styles.name}>{t(`nav.${item.key}`)}</span>
              {item.key === 'notifications' && count > 0 && (
                // Read out after the page name: "Notifications, Reminders: 3".
                <span className={styles.hidden}>
                  {t('notifications.count', { number: formatPlain(count, settings.digitStyle) })}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
