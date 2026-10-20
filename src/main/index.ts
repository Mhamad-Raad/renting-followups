import { join } from 'node:path';
import { app, BrowserWindow, Menu } from 'electron';
import { hardenSession, hardenWindow } from './security';

const APP_NAME = 'Rent Tracker';
const MIN_WIDTH = 1100;
const MIN_HEIGHT = 700;
const isDev = !app.isPackaged;
const rendererDirectory = join(import.meta.dirname, '../renderer');

/**
 * Development and tests never touch the owner's real data: they use a separate
 * folder, which end-to-end tests can point elsewhere with RENT_TRACKER_DATA_DIR.
 */
function configureDataDirectory(): void {
  app.setName(APP_NAME);
  if (!isDev) return;
  const override = process.env['RENT_TRACKER_DATA_DIR'];
  app.setPath('userData', override ?? join(app.getPath('appData'), `${APP_NAME}-dev`));
}

function createMainWindow(): void {
  const window = new BrowserWindow({
    title: APP_NAME,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: isDev,
    },
  });
  hardenWindow(window);

  // The page sets a translated title; development builds add a visible marker.
  window.on('page-title-updated', (event, title) => {
    if (!isDev) return;
    event.preventDefault();
    window.setTitle(`${title} [DEV]`);
  });
  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(rendererDirectory, 'index.html'));
  }
}

configureDataDirectory();

void app.whenReady().then(() => {
  // Windows gets no menu bar: the app's own sidebar is the only navigation.
  if (process.platform === 'win32') Menu.setApplicationMenu(null);
  hardenSession(rendererDirectory);
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
