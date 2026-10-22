import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu } from 'electron';
import { DEFAULT_SETTINGS, LANGUAGES, type Language, type ThemeMode } from '@shared/settings';
import {
  closeDatabase,
  isDamageError,
  isIntact,
  openDatabase,
  readLanguageQuietly,
  type Db,
} from './db/connection';
import { migrate } from './db/migrate';
import { MIGRATIONS } from './db/migrations';
import { createRepositories } from './db/repositories';
import { createKeyValueStore } from './db/repositories/settings';
import { registerIpcHandlers, registerRecoveryIpcHandlers } from './ipc';
import type { RestoreDependencies } from './ipc/backup';
import { currentReminders } from './ipc/notifications';
import { hardenSession, hardenWindow } from './security';
import { createAuthService } from './services/auth';
import { writeSafetySnapshot } from './services/backup';
import { startDailyToast, stopDailyToast } from './services/dailyToast';
import { describeError, initLogger, logger } from './services/logger';
import { createLogoStore } from './services/logo';
import { applyReadyRestore, clearStep } from './services/restore';
import { startupFailureMessage } from './services/messages';
import { translate } from './services/translate';
import { appWebPreferences, loadRenderer, RENDERER_DIRECTORY } from './windows';

const APP_NAME = 'Rent Tracker';
const MIN_WIDTH = 1100;
const MIN_HEIGHT = 700;
const isDev = !app.isPackaged;
// Automated tests run the app invisibly so they never take over the developer's screen.
const isGhost = isDev && process.env['RENT_TRACKER_GHOST'] === '1';
const DATABASE_FILE = 'rent-tracker.db';
const MEMORY_LOG_INTERVAL_MS = 30_000;
const RESTART_DELAY_MS = 150;
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

/**
 * Closes the app and starts it again, for example to put a restored backup in
 * place. In test ghost mode the test starts it again itself.
 */
function restartApp(): void {
  if (!isGhost) app.relaunch();
  // Quit once the answer has reached the screen; quitting closes the database cleanly.
  setTimeout(() => app.quit(), RESTART_DELAY_MS);
}

/** Opens the database and checks it; null (and closed again) when the file is damaged. */
function openIntactDatabase(file: string): Db | null {
  try {
    const db = openDatabase(file);
    if (isIntact(db)) return db;
  } catch (error) {
    if (!isDamageError(error)) throw error;
  }
  closeDatabase();
  return null;
}

/**
 * Puts a confirmed backup in place, opens and checks the database, upgrades
 * it if needed, and connects the screen to it. A damaged database is left
 * untouched and the screen offers only Restore from backup.
 */
function startServices(): { themeMode: ThemeMode } {
  const dataDirectory = app.getPath('userData');
  initLogger(join(dataDirectory, 'logs'));
  const databaseFile = join(dataDirectory, DATABASE_FILE);
  const safetyFolder = join(dataDirectory, 'safety-copies');
  const restorePaths = {
    staging: join(dataDirectory, 'restore'),
    database: databaseFile,
    logoFolder: join(dataDirectory, 'logo'),
    safetyFolder,
  };
  const outcome = applyReadyRestore(restorePaths, new Date());
  // A backup checked but never confirmed (the app was closed on the question) is not kept.
  clearStep(restorePaths, 'pending');
  if (outcome) logger.info('restore.applied', { ok: outcome.ok });
  const restore = (language: () => Language): RestoreDependencies => ({
    paths: restorePaths,
    migrations: MIGRATIONS,
    language,
    outcome,
    restart: restartApp,
  });

  const db = openIntactDatabase(databaseFile);
  if (!db) {
    logger.error('app.database_damaged', {});
    const saved = readLanguageQuietly(databaseFile);
    const language = LANGUAGES.find((known) => known === saved) ?? DEFAULT_SETTINGS.language;
    registerRecoveryIpcHandlers(restore(() => language));
    return { themeMode: DEFAULT_SETTINGS.themeMode };
  }
  const { from, to } = migrate(db, MIGRATIONS, {
    beforeMigrate: (fromVersion) =>
      writeSafetySnapshot(db, safetyFolder, `before-migration-v${fromVersion}`),
  });
  logger.info('app.started', { schemaFrom: from, schemaTo: to, packaged: app.isPackaged });

  const repos = createRepositories(db);
  const auth = createAuthService(repos.credentials);
  const logo = createLogoStore(restorePaths.logoFolder, createKeyValueStore(db));
  registerIpcHandlers({
    db,
    repos,
    auth,
    logo,
    dataDirectory,
    restore: restore(() => repos.settings.getAll().language),
  });
  if (!isGhost) {
    startDailyToast({
      countReminders: () => currentReminders(repos).length,
      texts: (count) => {
        const { language } = repos.settings.getAll();
        return {
          title: translate(language, 'app.name'),
          body: translate(language, 'notifications.toastBody', { number: String(count) }),
        };
      },
      onClick: focusMainWindow,
    });
  }
  return { themeMode: repos.settings.getAll().themeMode };
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
    webPreferences: appWebPreferences(),
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

  void loadRenderer(window);
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
  hardenSession(RENDERER_DIRECTORY);
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
  stopDailyToast();
  closeDatabase();
});
