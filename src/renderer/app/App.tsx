import { HashRouter, Route, Routes } from 'react-router';
import { AuthGate } from './AuthGate';
import { CrashScreen } from './CrashScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { ReceiptPrint } from '../print/ReceiptPrint';
import { ReportPrint } from '../print/ReportPrint';
import { Layout } from './Layout';
import { INNER_ROUTES, NAV_ITEMS } from './routes';
import { SettingsProvider } from './SettingsContext';
import { StatusScreen } from './StatusScreen';

export function App() {
  return (
    <ErrorBoundary fallback={() => <CrashScreen onGoBack={() => window.location.reload()} />}>
      <SettingsProvider
        renderLoading={() => <StatusScreen kind="loading" />}
        renderError={(retry) => <StatusScreen kind="error" onRetry={retry} />}
      >
        <AuthGate>
          <HashRouter>
            <Routes>
              {/* Print pages: no sidebar; opened by the main process in hidden windows. */}
              <Route path="/print/receipt/:id" element={<ReceiptPrint />} />
              <Route path="/print/report" element={<ReportPrint />} />
              <Route element={<Layout />}>
                {[...NAV_ITEMS, ...INNER_ROUTES].map((route) => (
                  <Route key={route.path} path={route.path} element={route.element} />
                ))}
                <Route path="*" element={NAV_ITEMS[0]?.element} />
              </Route>
            </Routes>
          </HashRouter>
        </AuthGate>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
