import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { formatPlain } from '@shared/formatNumber';
import { Icon } from '../components/Icon';
import { NAV_ITEMS } from './routes';
import { useSettings } from './SettingsContext';
import { useReminders } from './useReminders';
import styles from './Sidebar.module.css';
import logo from '../../../resources/icon.png';

/**
 * The fixed, always-visible main menu on the start side of the window. It opens
 * collapsed to its icons; the button at the top shows or hides the page names.
 */
/** Above this the bell shows "99+", so the number never covers the bell; the page shows the exact count. */
const BADGE_MAX = 99;

export function Sidebar() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const reminders = useReminders();
  const count = reminders.state.status === 'ready' ? reminders.state.data.length : 0;
  const [collapsed, setCollapsed] = useState(true);
  // Collapsed, the names stay for screen readers and show as a tooltip; only the eye loses them.
  const nameClass = collapsed ? styles.hidden : undefined;
  return (
    <nav
      className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}
      aria-label={t('nav.label')}
    >
      <p className={styles.appName}>
        <img src={logo} alt="" className={styles.logo} />
        <span className={nameClass}>{t('app.name')}</span>
      </p>
      <button
        type="button"
        className={styles.link}
        aria-expanded={!collapsed}
        title={collapsed ? t('nav.expand') : t('nav.collapse')}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className={styles.icon}>
          <Icon name="sidebar" />
        </span>
        <span className={nameClass}>{collapsed ? t('nav.expand') : t('nav.collapse')}</span>
      </button>
      <ul className={styles.list}>
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              title={collapsed ? t(`nav.${item.key}`) : undefined}
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
              <span className={nameClass}>{t(`nav.${item.key}`)}</span>
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
