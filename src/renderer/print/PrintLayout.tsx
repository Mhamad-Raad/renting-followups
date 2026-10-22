import { createContext, useContext } from 'react';
import { Outlet } from 'react-router';
import { useIpcQuery } from '../app/ipc';

const LogoContext = createContext<string | null>(null);

/** The print logo from Settings, as a data address; null when none is set. */
export function usePrintLogo(): string | null {
  return useContext(LogoContext);
}

/**
 * Wraps every print page: loads the logo once, and only then shows the page,
 * so a page never says it is ready before its logo is there. A logo that
 * cannot be read is left out rather than stopping the print.
 */
export function PrintLayout() {
  const logo = useIpcQuery('settings:logo');
  if (logo.state.status === 'loading') return null;
  return (
    <LogoContext.Provider value={logo.state.status === 'ready' ? logo.state.data : null}>
      <Outlet />
    </LogoContext.Provider>
  );
}
