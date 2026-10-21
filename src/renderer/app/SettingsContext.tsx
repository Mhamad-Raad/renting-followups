import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { IpcErrorCode } from '@shared/ipc';
import { applySettingsUpdate, type Settings, type SettingsUpdate } from '@shared/settings';
import { i18next, LANGUAGE_DIRECTION } from '../i18n';
import { isPrintPage } from '../print/printPage';
import { callIpc, useIpcQuery } from './ipc';

export type UpdateSettings = (
  changes: SettingsUpdate,
) => Promise<{ ok: true } | { ok: false; error: IpcErrorCode }>;

interface SettingsContextValue {
  settings: Settings;
  updateSettings: UpdateSettings;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Puts language, direction, theme and text size on <html>, where the CSS reads them. */
function applyToDocument(settings: Settings): void {
  const root = document.documentElement;
  root.lang = settings.language;
  root.dir = LANGUAGE_DIRECTION[settings.language];
  // Paper is always printed light and at normal size, whatever the screen uses.
  root.dataset['theme'] = isPrintPage() ? 'light' : settings.themeMode;
  root.dataset['fontSize'] = isPrintPage() ? 'normal' : settings.fontSize;
  void i18next.changeLanguage(settings.language);
  document.title = i18next.t('app.name');
}

interface SettingsProviderProps {
  children: ReactNode;
  /** Shown while settings load, and if they cannot be loaded. */
  renderLoading: () => ReactNode;
  renderError: (retry: () => void) => ReactNode;
}

export function SettingsProvider({ children, renderLoading, renderError }: SettingsProviderProps) {
  const { state, reload, setData } = useIpcQuery('settings:get');
  const settings = state.status === 'ready' ? state.data : null;

  useLayoutEffect(() => {
    if (settings) applyToDocument(settings);
  }, [settings]);

  const updateSettings = useCallback<UpdateSettings>(
    async (changes) => {
      // Show the change at once; the database answer follows within milliseconds.
      setData((current) => applySettingsUpdate(current, changes));
      const result = await callIpc('settings:update', changes);
      if (result.ok) {
        setData(result.data);
        return { ok: true };
      }
      // Not saved: go back to what is really stored.
      const stored = await callIpc('settings:get');
      if (stored.ok) setData(stored.data);
      return result;
    },
    [setData],
  );

  const value = useMemo(
    () => (settings ? { settings, updateSettings } : null),
    [settings, updateSettings],
  );

  if (state.status === 'error') return renderError(reload);
  if (!value) return renderLoading();
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
