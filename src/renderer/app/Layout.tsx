import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { formatDate } from '@shared/dates';
import { Notice } from '../components/Notice';
import { StartupReminders } from '../pages/notifications/StartupReminders';
import { CrashScreen } from './CrashScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { useIpcQuery } from './ipc';
import styles from './Layout.module.css';
import { useMonthWatch } from './newMonth';
import { useSettings } from './SettingsContext';
import { Sidebar } from './Sidebar';

/**
 * Sidebar plus the current screen. The screen is keyed by its address, so a
 * page change replays the entrance animation and clears any crash message,
 * while the sidebar always stays usable.
 */
export function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings } = useSettings();
  useMonthWatch();
  // Checked once when the app opens: money received "after today" means the clock is behind.
  const clock = useIpcQuery('clock:check');
  return (
    <div className={styles.shell}>
      <Sidebar />
      <StartupReminders />
      <main className={styles.main}>
        {clock.state.status === 'ready' && clock.state.data.futureDate && (
          <div className={styles.warning}>
            <Notice tone="warning">
              {t('clock.wrong', {
                date: formatDate(clock.state.data.futureDate, settings.digitStyle),
              })}
            </Notice>
          </div>
        )}
        <div key={pathname} className={styles.page}>
          <ErrorBoundary
            fallback={(reset) => (
              <CrashScreen
                onGoBack={() => {
                  reset();
                  void navigate(-1);
                }}
              />
            )}
          >
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
