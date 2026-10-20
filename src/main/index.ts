import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu } from 'electron';
import type { ThemeMode } from '@shared/settings';
import { closeDatabase, openDatabase } from './db/connection';
import { migrate } from './db/migrate';
import { MIGRATIONS } from './db/migrations';
import { createCredentialsRepository, createSettingsRepository } from './db/repositories/settings';
import { registerIpcHandlers } from './ipc';
import { hardenSession, hardenWindow } from './security';
import { createAuthService } from './services/auth';
import { writeSafetySnapshot } from './services/backup';
import { describeError, initLogger, logger } from './services/logger';
import { startupFailureMessage } from './services/messages';

const APP_NAME = 'Rent Tracker';
const MIN_WIDTH = 1100;
const MIN_HEIGHT = 700;
const isDev = !app.isPackaged;
// Automated tests run the app invisibly so they never take over the developer's screen.
const isGhost = isDev && process.env['RENT_TRACKER_GHOST'] === '1';
const rendererDirectory = join(import.meta.dirname, '../renderer');
const DATABASE_FILE = 'rent-tracker.db';
const MEMORY_LOG_INTERVAL_MS = 30_000;
// Matches the page background of each theme, so the window never flashes white.
const WINDOW_BACKGROUND: Record<ThemeMode, string> = { light: '#f6f4ef', dark: '#1b1d21' };

let memoryLogTimer: NodeJS.Timeout | null = null;
let mainWindow: BrowserWindow | null = null;

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
  const auth = createAuthService(createCredentialsRepository(db));
  registerIpcHandlers({ settings, auth });
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
    focusable: !isGhost,
    skipTaskbar: isGhost,
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
  mainWindow = window;
  window.on('closed', () => {
    mainWindow = null;
  });

  // The page sets a translated title; development builds add a visible marker.
  window.on('page-title-updated', (event, title) => {
    if (!isDev) return;
    event.preventDefault();
    window.setTitle(`${title} [DEV]`);
  });
  window.once('ready-to-show', () => {
    window.maximize();
    if (isGhost) {
      // Still rendered (so tests can drive it), but invisible, unfocused and click-through.
      window.setOpacity(0);
      window.setIgnoreMouseEvents(true);
      window.showInactive();
      return;
    }
    window.show();
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(rendererDirectory, 'index.html'));
  }
}

/** A second launch only brings the open window to the front: two copies must never share one database. */
function focusMainWindow(): void {
  if (!mainWindow || isGhost) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function startApp(): void {
  // Windows gets no menu bar: the app's own sidebar is the only navigation.
  if (process.platform === 'win32') Menu.setApplicationMenu(null);
  if (isGhost) app.dock?.hide();
  hardenSession(rendererDirectory);
  let themeMode: ThemeMode;
  try {
    ({ themeMode } = startServices());
  } catch (error) {
    // Nothing has been changed (migrations are all-or-nothing); explain plainly and stop.
    logger.error('app.start_failed', describeError(error));
    const { title, body } = startupFailureMessage();
    dialog.showErrorBox(title, body);
    app.quit();
    return;
  }
  if (isDev) startMemoryLog();
  createMainWindow(themeMode);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(themeMode);
  });
}

configureDataDirectory();

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', focusMainWindow);
  void app.whenReady().then(startApp);
} else {
  app.quit();
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  if (memoryLogTimer) clearInterval(memoryLogTimer);
  memoryLogTimer = null;
  closeDatabase();
});
