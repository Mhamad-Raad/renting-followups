import { Outlet, useLocation, useNavigate } from 'react-router';
import { CrashScreen } from './CrashScreen';
import { ErrorBoundary } from './ErrorBoundary';
import styles from './Layout.module.css';
import { Sidebar } from './Sidebar';

/**
 * Sidebar plus the current screen. The screen is keyed by its address, so a
 * page change replays the entrance animation and clears any crash message,
 * while the sidebar always stays usable.
 */
export function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
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
