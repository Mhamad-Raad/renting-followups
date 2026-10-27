import { expect, test, type Page } from '@playwright/test';
import { createDataDir, launchUnlocked, removeDataDir, reloadApp } from './launch';

async function rootAttributes(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      lang: root.lang,
      dir: root.dir,
      theme: root.dataset['theme'],
      fontSize: root.dataset['fontSize'],
    };
  });
}

/** Where the sidebar sits: on the right in RTL languages, on the left in English. */
async function sidebarSide(page: Page): Promise<'left' | 'right'> {
  const box = await page.getByRole('navigation').boundingBox();
  // Electron windows have no Playwright viewport size; ask the page itself.
  const width = await page.evaluate(() => window.innerWidth);
  if (!box) throw new Error('Sidebar not found');
  return box.x + box.width / 2 < width / 2 ? 'left' : 'right';
}

test('opens in Sorani, right to left, with the five sidebar items', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(5);
    expect(await rootAttributes(page)).toEqual({
      lang: 'ckb',
      dir: 'rtl',
      theme: 'light',
      fontSize: 'normal',
    });
    expect(await sidebarSide(page)).toBe('right');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('سەرەکی');
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('switching language, theme and text size applies at once and is remembered', async () => {
  const dataDir = createDataDir();
  try {
    const first = await launchUnlocked(dataDir);
    await first.page.getByRole('navigation').getByRole('link').nth(4).click();
    await first.page.getByRole('radio', { name: 'English', exact: true }).check();
    await expect(first.page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    expect(await sidebarSide(first.page)).toBe('left');

    await first.page.getByRole('radio', { name: 'Dark', exact: true }).check();
    await first.page.getByRole('radio', { name: 'Extra large', exact: true }).check();
    expect(await rootAttributes(first.page)).toEqual({
      lang: 'en',
      dir: 'ltr',
      theme: 'dark',
      fontSize: 'extraLarge',
    });
    await first.app.close();

    const second = await launchUnlocked(dataDir);
    await expect(second.page.getByRole('navigation')).toBeVisible();
    expect(await rootAttributes(second.page)).toEqual({
      lang: 'en',
      dir: 'ltr',
      theme: 'dark',
      fontSize: 'extraLarge',
    });
    await second.app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('every sidebar item opens its screen', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const links = page.getByRole('navigation').getByRole('link');
    for (let index = 0; index < 5; index += 1) {
      const label = await links.nth(index).innerText();
      await links.nth(index).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
      await expect(links.nth(index)).toHaveAttribute('aria-current', 'page');
    }
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('makes no network requests and logs no errors', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  try {
    await reloadApp(page);
    const links = page.getByRole('navigation').getByRole('link');
    for (let index = 0; index < 5; index += 1) await links.nth(index).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.filter((url) => !url.startsWith('file://'))).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('the window starts maximized and never gets smaller than 1100×700', async () => {
  const dataDir = createDataDir();
  const { app } = await launchUnlocked(dataDir);
  try {
    const readWindow = () =>
      app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return { minimumSize: window?.getMinimumSize(), maximized: window?.isMaximized() };
      });
    await expect.poll(async () => (await readWindow()).maximized).toBe(true);
    expect((await readWindow()).minimumSize).toEqual([1100, 700]);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});

test('the sidebar opens collapsed to its icons and shows the names on request', async () => {
  const dataDir = createDataDir();
  const { app, page } = await launchUnlocked(dataDir);
  try {
    const sidebar = page.getByRole('navigation');
    const toggle = sidebar.getByRole('button');
    const widthOf = async () => (await sidebar.boundingBox())?.width ?? 0;
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar.getByRole('link')).toHaveCount(5);
    const collapsedWidth = await widthOf();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(widthOf).toBeGreaterThan(collapsedWidth * 2);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(widthOf).toBeCloseTo(collapsedWidth, 0);
  } finally {
    await app.close();
    removeDataDir(dataDir);
  }
});
