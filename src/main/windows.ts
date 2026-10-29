import { join } from 'node:path';
import { app, type BrowserWindow, type WebPreferences } from 'electron';

const isDev = !app.isPackaged;
const rendererDirectory = join(import.meta.dirname, '../renderer');

/** Where the app's own screen files are, for the security allow-list. */
export const RENDERER_DIRECTORY = rendererDirectory;

/** The same locked-down settings for every window the app opens, visible or hidden. */
export function appWebPreferences(): WebPreferences {
  return {
    preload: join(import.meta.dirname, '../preload/index.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
    devTools: isDev,
  };
}

/** Loads the app's page into a window, optionally at an in-app address such as `/print/report`. */
export function loadRenderer(window: BrowserWindow, route = ''): Promise<void> {
  const hash = route ? `#${route}` : '';
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devServerUrl) return window.loadURL(`${devServerUrl}${hash}`);
  return window.loadFile(join(rendererDirectory, 'index.html'), { hash: route });
}
