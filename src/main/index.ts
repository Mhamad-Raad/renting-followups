import { join } from 'node:path';
import { app, BrowserWindow, Menu } from 'electron';
import type { ThemeMode } from '@shared/settings';
import { closeDatabase, openDatabase } from './db/connection';
import { migrate } from './db/migrate';
import { MIGRATIONS } from './db/migrations';
import { createSettingsRepository } from './db/repositories/settings';
import { registerIpcHandlers } from './ipc';
import { hardenSession, hardenWindow } from './security';
import { writeSafetySnapshot } from './services/backup';
import { initLogger, logger } from './services/logger';

const APP_NAME = 'Rent Tracker';
const MIN_WIDTH = 1100;
const MIN_HEIGHT = 700;
const isDev = !app.isPackaged;
const rendererDirectory = join(import.meta.dirname, '../renderer');
const DATABASE_FILE = 'rent-tracker.db';
const MEMORY_LOG_INTERVAL_MS = 30_000;
// Matches the page background of each theme, so the window never flashes white.
const WINDOW_BACKGROUND: Record<ThemeMode, string> = { light: '#f6f4ef', dark: '#1b1d21' };

let memoryLogTimer: NodeJS.Timeout | null = null;

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

/** Opens the database, upgrades it if needed, and connects the screen to it. */
function startServices(): { themeMode: ThemeMode } {
  const dataDirectory = app.getPath('userData');
  initLogger(join(dataDirectory, 'logs'));
  const db = openDatabase(join(dataDirectory, DATABASE_FILE));
  const { from, to } = migrate(db, MIGRATIONS, {
    beforeMigrate: (fromVersion) =>
      writeSafetySnapshot(
        db,
        join(dataDirectory, 'safety-copies'),
        `before-migration-v${fromVersion}`,
      ),
  });
  logger.info('app.started', { schemaFrom: from, schemaTo: to, packaged: app.isPackaged });

  const settings = createSettingsRepository(db);
  registerIpcHandlers({ settings });
  return { themeMode: settings.getAll().themeMode };
}

/** Development only: records memory use so leaks show up as a rising line in the log. */
function startMemoryLog(): void {
  memoryLogTimer = setInterval(() => {
    const { rss, heapUsed } = process.memoryUsage();
    const toMb = (bytes: number) => Math.round(bytes / 1_048_576);
    logger.info('memory', { rssMb: toMb(rss), heapUsedMb: toMb(heapUsed) });
  }, MEMORY_LOG_INTERVAL_MS);
}

function createMainWindow(themeMode: ThemeMode): void {
  const window = new BrowserWindow({
    title: APP_NAME,
    backgroundColor: WINDOW_BACKGROUND[themeMode],
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
  const { themeMode } = startServices();
  if (isDev) startMemoryLog();
  createMainWindow(themeMode);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(themeMode);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  if (memoryLogTimer) clearInterval(memoryLogTimer);
  memoryLogTimer = null;
  closeDatabase();
});
