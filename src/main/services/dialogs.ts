import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron';

/** Shows Windows' Open dialog over the app's window. The chosen path, or null when the owner cancels. */
export async function askToOpen(options: OpenDialogOptions): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow();
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}
