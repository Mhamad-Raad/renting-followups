import { join } from 'node:path';
import { app, BrowserWindow, Menu } from 'electron';
import { hardenSession, hardenWindow } from './security';

const MIN_WIDTH = 1100;
const MIN_HEIGHT = 700;
const isDev = !app.isPackaged;
const rendererDirectory = join(import.meta.dirname, '../renderer');

function createMainWindow(): void {
  const window = new BrowserWindow({
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
