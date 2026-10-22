import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import ckb from '../../src/renderer/i18n/ckb.json' with { type: 'json' };
import {
  createDataDir,
  launchApp,
  launchUnlocked,
  removeDataDir,
  TEST_PASSWORD,
  TEST_RECOVERY_PHRASE,
} from './launch';

// The app starts in Sorani, so the screens are found by their Sorani wording.
const text = ckb.auth;

async function fill(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).fill(value);
}

async function setUpThroughScreen(page: Page, password: string, again: string, phrase: string) {
  await fill(page, text.password, password);
  await fill(page, text.passwordAgain, again);
  await fill(page, text.recoveryPhrase, phrase);
  await page.getByRole('button', { name: text.setup.submit }).click();
}

async function unlockThroughScreen(page: Page, password: string) {
  await fill(page, text.password, password);
  await page.getByRole('button', { name: text.lock.submit, exact: true }).click();
}

test('first run creates the password; relaunch asks for it and rejects a wrong one', async () => {
  const dataDir = createDataDir();
  try {
    const first = await launchApp(dataDir);
    await expect(first.page.getByRole('heading', { level: 1 })).toHaveText(text.setup.title);
    await expect(first.page.getByText(text.writeItDown)).toBeVisible();

    await setUpThroughScreen(first.page, TEST_PASSWORD, 'something else', TEST_RECOVERY_PHRASE);
    await expect(first.page.getByText(text.problems.passwordsDiffer)).toBeVisible();
    await expect(first.page.getByRole('navigation')).toHaveCount(0);

    await setUpThroughScreen(first.page, TEST_PASSWORD, TEST_PASSWORD, TEST_RECOVERY_PHRASE);
    await expect(first.page.getByRole('navigation')).toBeVisible();
    await first.app.close();

    const second = await launchApp(dataDir);
    await expect(second.page.getByRole('heading', { level: 1 })).toHaveText(text.lock.title);
    await unlockThroughScreen(second.page, 'wrong-password');
    await expect(second.page.getByRole('alert')).toHaveText(
      text.wrongPassword.replace('{{tries}}', '4'),
    );
    await expect(second.page.getByRole('navigation')).toHaveCount(0);

    await unlockThroughScreen(second.page, TEST_PASSWORD);
    await expect(second.page.getByRole('navigation')).toBeVisible();
    await second.app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('the eye inside the password box shows and hides what was typed', async () => {
  const dataDir = createDataDir();
  try {
    const { app, page } = await launchApp(dataDir);
    const box = page.getByLabel(text.password, { exact: true });
    await box.fill('secret-1');
    await expect(box).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: text.show }).first().click();
    await expect(box).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: text.hide }).first().click();
    await expect(box).toHaveAttribute('type', 'password');
    await app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('five wrong passwords make the owner wait, with a countdown', async () => {
  const dataDir = createDataDir();
  try {
    await (await launchUnlocked(dataDir)).app.close();
    const { app, page } = await launchApp(dataDir);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await unlockThroughScreen(page, `wrong-${attempt}`);
      await expect(page.getByLabel(text.password, { exact: true })).toHaveValue('');
      await expect(page.getByLabel(text.password, { exact: true })).toBeFocused();
    }
    const waitStart = text.wait.split('{{')[0] ?? '';
    await expect(page.getByRole('alert')).toContainText(waitStart.trim());
    await expect(page.getByRole('button', { name: text.lock.submit, exact: true })).toBeDisabled();
    await app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('the recovery phrase sets a new password', async () => {
  const dataDir = createDataDir();
  try {
    await (await launchUnlocked(dataDir)).app.close();
    const first = await launchApp(dataDir);
    await first.page.getByRole('button', { name: text.forgot }).click();
    await expect(first.page.getByRole('heading', { level: 1 })).toHaveText(text.recover.title);
    // Typed later in capitals with extra spaces: still accepted.
    await fill(first.page, text.recoveryPhrase, `  ${TEST_RECOVERY_PHRASE.toUpperCase()}  `);
    await fill(first.page, text.newPassword, 'brand-new-pass');
    await fill(first.page, text.newPasswordAgain, 'brand-new-pass');
    await first.page.getByRole('button', { name: text.recover.submit }).click();
    await expect(first.page.getByRole('navigation')).toBeVisible();
    await first.app.close();

    const second = await launchApp(dataDir);
    await unlockThroughScreen(second.page, TEST_PASSWORD);
    await expect(second.page.getByRole('alert')).toBeVisible();
    await unlockThroughScreen(second.page, 'brand-new-pass');
    await expect(second.page.getByRole('navigation')).toBeVisible();
    await second.app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('while locked, the main process refuses data requests', async () => {
  const dataDir = createDataDir();
  try {
    await (await launchUnlocked(dataDir)).app.close();
    const { app, page } = await launchApp(dataDir);
    const result = await page.evaluate(() =>
      window.api.invoke('settings:update', { language: 'en' }),
    );
    expect(result).toEqual({ ok: false, error: 'locked' });
    const settings = await page.evaluate(() => window.api.invoke('settings:get'));
    expect(settings).toMatchObject({ ok: true, data: { language: 'ckb' } });
    await app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('changing the password in Settings takes effect on the next start', async () => {
  const dataDir = createDataDir();
  try {
    const first = await launchUnlocked(dataDir);
    const settingsText = ckb.settings;
    await first.page.getByRole('link', { name: ckb.nav.settings }).click();
    await first.page.getByRole('button', { name: settingsText.changePassword }).click();
    const dialog = first.page.getByRole('dialog');
    await dialog.getByLabel(text.currentPassword, { exact: true }).fill(TEST_PASSWORD);
    await dialog.getByLabel(text.newPassword, { exact: true }).fill('changed-pass');
    await dialog.getByLabel(text.newPasswordAgain, { exact: true }).fill('changed-pass');
    await dialog.getByRole('button', { name: ckb.common.save }).click();
    await expect(first.page.getByText(settingsText.passwordChanged)).toBeVisible();
    await expect(dialog).toBeHidden();
    await first.app.close();

    const second = await launchApp(dataDir);
    await unlockThroughScreen(second.page, 'changed-pass');
    await expect(second.page.getByRole('navigation')).toBeVisible();
    await second.app.close();
  } finally {
    removeDataDir(dataDir);
  }
});

test('the password and phrase are never stored or logged in plain text', async () => {
  const dataDir = createDataDir();
  try {
    const { app } = await launchUnlocked(dataDir);
    await app.close();
    const files = readdirSync(dataDir, { recursive: true, encoding: 'utf8' }).filter(
      (file) => file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.log'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(join(dataDir, file)).toString('latin1');
      expect(content, file).not.toContain(TEST_PASSWORD);
      expect(content, file).not.toContain(TEST_RECOVERY_PHRASE);
    }
  } finally {
    removeDataDir(dataDir);
  }
});

test('a second start does not open a second copy', async () => {
  const dataDir = createDataDir();
  const first = await launchApp(dataDir);
  try {
    const electronPath = await first.app.evaluate(() => process.execPath);
    const second = spawn(electronPath, [join(import.meta.dirname, '../../out/main/index.js')], {
      env: { ...process.env, RENT_TRACKER_DATA_DIR: dataDir, RENT_TRACKER_GHOST: '1' },
      stdio: 'ignore',
    });
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        second.kill();
        reject(new Error('The second copy kept running'));
      }, 10_000);
      second.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    expect(exitCode).toBe(0);
    expect(
      await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    ).toBe(1);
  } finally {
    await first.app.close();
    removeDataDir(dataDir);
  }
});
