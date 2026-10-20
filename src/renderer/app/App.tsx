import { HashRouter, Route, Routes } from 'react-router';
import { CrashScreen } from './CrashScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { Layout } from './Layout';
import { NAV_ITEMS } from './routes';
import { SettingsProvider } from './SettingsContext';
import { StatusScreen } from './StatusScreen';

export function App() {
  return (
    <ErrorBoundary fallback={() => <CrashScreen onGoBack={() => window.location.reload()} />}>
      <SettingsProvider
        renderLoading={() => <StatusScreen kind="loading" />}
        renderError={(retry) => <StatusScreen kind="error" onRetry={retry} />}
      >
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              {NAV_ITEMS.map((item) => (
                <Route key={item.path} path={item.path} element={item.element} />
              ))}
              <Route path="*" element={NAV_ITEMS[0]?.element} />
            </Route>
          </Routes>
        </HashRouter>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
