import { createContext, useContext, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useIpcQuery } from '../app/ipc';

const LogoContext = createContext<string | null>(null);

/** The print logo from Settings, as a data address; null when none is set. */
export function usePrintLogo(): string | null {
  return useContext(LogoContext);
}

/**
 * Loads the logo once, and only then shows what is inside, so a page never
 * says it is ready before its logo is there. A logo that cannot be read is
 * left out rather than stopping the print.
 */
export function PrintLogo({ children }: { children: ReactNode }) {
  const logo = useIpcQuery('settings:logo');
  if (logo.state.status === 'loading') return null;
  return (
    <LogoContext.Provider value={logo.state.status === 'ready' ? logo.state.data : null}>
      {children}
    </LogoContext.Provider>
  );
}

/** Wraps every print page. */
export function PrintLayout() {
  return (
    <PrintLogo>
      <Outlet />
    </PrintLogo>
  );
}
