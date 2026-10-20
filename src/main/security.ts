import { pathToFileURL } from 'node:url';
import { app, session, type BrowserWindow } from 'electron';

/**
 * The only places the window may load anything from: the app's own renderer
 * files, plus the dev server (and its live-reload socket) during development.
 */
function createUrlAllowList(rendererDirectory: string): (url: string) => boolean {
  const allowedPrefixes = [`${pathToFileURL(rendererDirectory).href}/`, 'devtools://'];
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServerUrl) {
    const { origin } = new URL(devServerUrl);
    allowedPrefixes.push(`${origin}/`, `${origin.replace(/^http/, 'ws')}/`);
  }
  return (url) => allowedPrefixes.some((prefix) => url.startsWith(prefix));
}

/**
 * Blocks every network request, permission prompt and webview. The app must
 * make zero network requests. Call once, before any window opens.
 */
export function hardenSession(rendererDirectory: string): void {
  const isAllowedUrl = createUrlAllowList(rendererDirectory);
  const defaultSession = session.defaultSession;
  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedUrl(details.url) });
  });
  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  defaultSession.setPermissionCheckHandler(() => false);

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });
}

/**
 * Keeps the window on the app's own page. In-app page changes use the URL hash
 * and never trigger navigation, so every real navigation (a dropped file, a
 * link) is blocked.
 */
export function hardenWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
}
