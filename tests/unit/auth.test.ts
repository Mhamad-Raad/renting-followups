import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  changePasswordInputSchema,
  checkNewPassword,
  checkNewRecoveryPhrase,
  setupInputSchema,
} from '@shared/auth';
import { createConnection, type Db } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';
import { createCredentialsRepository } from '../../src/main/db/repositories/settings';
import {
  createAttemptLimiter,
  createAuthService,
  hashSecret,
  verifySecret,
} from '../../src/main/services/auth';

const PASSWORD = 'gul-1234';
const PHRASE = 'darî sêw le hewşa malî bawkm';

let db: Db;
let clock: number;
const now = () => clock;

function service() {
  return createAuthService(createCredentialsRepository(db), now);
}

async function setUpService() {
  const auth = service();
  await auth.setup({ password: PASSWORD, recoveryPhrase: PHRASE });
  // A fresh service is what a relaunch looks like: locked, same stored hashes.
  return service();
}

beforeEach(() => {
  db = createConnection(':memory:');
  migrate(db, MIGRATIONS);
  clock = 1_000_000;
});

afterEach(() => {
  db.close();
});

describe('hashing', () => {
  it('verifies the right secret and rejects a wrong one', async () => {
    const stored = await hashSecret('secret');
    expect(await verifySecret('secret', stored)).toBe(true);
    expect(await verifySecret('Secret', stored)).toBe(false);
  });

  it('uses a new random salt every time', async () => {
    const [a, b] = await Promise.all([hashSecret('same'), hashSecret('same')]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('rejects a hash in an unknown format', async () => {
    const stored = await hashSecret('secret');
    expect(
      await verifySecret('secret', { ...stored, hash: stored.hash.replace('scrypt1', 'md5') }),
    ).toBe(false);
  });
});

describe('attempt limiter', () => {
  it('allows five wrong tries, then asks to wait 30 seconds, then allows five more', () => {
    const limiter = createAttemptLimiter(now);
    expect([1, 2, 3, 4].map(() => limiter.fail())).toEqual([4, 3, 2, 1]);
    expect(limiter.fail()).toBe(0);
    expect(limiter.waitSeconds()).toBe(30);
    clock += 29_001;
    expect(limiter.waitSeconds()).toBe(1);
    clock += 1_000;
    expect(limiter.waitSeconds()).toBe(0);
    expect(limiter.fail()).toBe(4);
  });

  it('starts counting again after a success', () => {
    const limiter = createAttemptLimiter(now);
    limiter.fail();
    limiter.fail();
    limiter.succeed();
    expect(limiter.fail()).toBe(4);
  });
});

describe('auth service', () => {
  it('starts in setup, and setup unlocks the app', async () => {
    const auth = service();
    expect(auth.status()).toBe('setup');
    expect(await auth.setup({ password: PASSWORD, recoveryPhrase: PHRASE })).toEqual({ ok: true });
    expect(auth.status()).toBe('unlocked');
  });

  it('refuses a second setup, so nobody can overwrite the password', async () => {
    const auth = await setUpService();
    expect(await auth.setup({ password: 'new-one', recoveryPhrase: 'another phrase' })).toEqual({
      ok: false,
      reason: 'already_set',
    });
  });

  it('is locked after a relaunch and opens only with the right password', async () => {
    const auth = await setUpService();
    expect(auth.status()).toBe('locked');
    expect(await auth.unlock('wrong')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: 4 });
    expect(auth.isUnlocked()).toBe(false);
    expect(await auth.unlock(PASSWORD)).toEqual({ ok: true });
    expect(auth.status()).toBe('unlocked');
  });

  it('makes the owner wait 30 seconds after five wrong passwords, even for the right one', async () => {
    const auth = await setUpService();
    for (let i = 0; i < 4; i += 1) await auth.unlock('wrong');
    expect(await auth.unlock('wrong')).toEqual({ ok: false, reason: 'wait', waitSeconds: 30 });
    expect(await auth.unlock(PASSWORD)).toEqual({ ok: false, reason: 'wait', waitSeconds: 30 });
    clock += 30_000;
    expect(await auth.unlock(PASSWORD)).toEqual({ ok: true });
  });

  it('recovers with the phrase, forgiving case, spaces and letter variants', async () => {
    const auth = await setUpService();
    const typedLater = `  ${PHRASE.toUpperCase().replace(/ /g, '   ')} `;
    expect(await auth.recover({ recoveryPhrase: typedLater, newPassword: 'fresh-pass' })).toEqual({
      ok: true,
    });
    expect(auth.status()).toBe('unlocked');
    const relaunched = service();
    expect(await relaunched.unlock(PASSWORD)).toMatchObject({ ok: false });
    expect(await relaunched.unlock('fresh-pass')).toEqual({ ok: true });
  });

  it('treats Arabic and Kurdish letter variants in the phrase as the same', async () => {
    const auth = service();
    await auth.setup({ password: PASSWORD, recoveryPhrase: 'کوردستانی جوان' });
    const relaunched = service();
    // Arabic kaf (ك) and yeh (ي) typed instead of the Kurdish letters.
    expect(
      await relaunched.recover({ recoveryPhrase: 'كوردستاني جوان', newPassword: 'fresh-pass' }),
    ).toEqual({ ok: true });
  });

  it('applies the 5-tries rule to the recovery phrase as well', async () => {
    const auth = await setUpService();
    for (let i = 0; i < 4; i += 1) {
      await auth.recover({ recoveryPhrase: 'not it at all', newPassword: 'fresh-pass' });
    }
    expect(
      await auth.recover({ recoveryPhrase: 'not it at all', newPassword: 'fresh-pass' }),
    ).toEqual({ ok: false, reason: 'wait', waitSeconds: 30 });
    expect(auth.isUnlocked()).toBe(false);
  });

  it('changes the password only with the current one', async () => {
    const auth = await setUpService();
    await auth.unlock(PASSWORD);
    expect(
      await auth.changePassword({ currentPassword: 'wrong', newPassword: 'next-pass' }),
    ).toMatchObject({ ok: false, reason: 'wrong' });
    expect(
      await auth.changePassword({ currentPassword: PASSWORD, newPassword: 'next-pass' }),
    ).toEqual({ ok: true });
    expect(await service().unlock('next-pass')).toEqual({ ok: true });
  });

  it('changes the recovery phrase only with the current password', async () => {
    const auth = await setUpService();
    await auth.unlock(PASSWORD);
    expect(
      await auth.changeRecoveryPhrase({
        currentPassword: 'wrong',
        newRecoveryPhrase: 'brand new phrase',
      }),
    ).toMatchObject({ ok: false, reason: 'wrong' });
    expect(
      await auth.changeRecoveryPhrase({
        currentPassword: PASSWORD,
        newRecoveryPhrase: 'brand new phrase',
      }),
    ).toEqual({ ok: true });
    const relaunched = service();
    expect(
      await relaunched.recover({ recoveryPhrase: PHRASE, newPassword: 'x-pass' }),
    ).toMatchObject({ ok: false });
    expect(
      await relaunched.recover({ recoveryPhrase: 'brand new phrase', newPassword: 'x-pass' }),
    ).toEqual({ ok: true });
  });

  it('never stores the password or the phrase in plain text', async () => {
    await setUpService();
    const everything = JSON.stringify(db.prepare('SELECT * FROM settings').all());
    expect(everything).not.toContain(PASSWORD);
    expect(everything.toLowerCase()).not.toContain('hewşa');
    expect(everything).toContain('scrypt1:');
  });
});

describe('input rules', () => {
  it('needs a password of at least 4 characters and a phrase of at least 8', () => {
    expect(setupInputSchema.safeParse({ password: 'abc', recoveryPhrase: PHRASE }).success).toBe(
      false,
    );
    expect(setupInputSchema.safeParse({ password: 'abcd', recoveryPhrase: 'short' }).success).toBe(
      false,
    );
    expect(setupInputSchema.safeParse({ password: 'abcd', recoveryPhrase: PHRASE }).success).toBe(
      true,
    );
  });

  it('rejects unknown fields and overly long values', () => {
    expect(
      setupInputSchema.safeParse({ password: 'abcd', recoveryPhrase: PHRASE, admin: true }).success,
    ).toBe(false);
    expect(
      changePasswordInputSchema.safeParse({ currentPassword: 'x'.repeat(201), newPassword: 'abcd' })
        .success,
    ).toBe(false);
  });
});

describe('new secret checks', () => {
  it.each([
    ['abc', 'abc', 'passwordTooShort'],
    ['abcd', 'abce', 'passwordsDiffer'],
    ['abcd', 'abcd', null],
  ])('password %j typed again as %j gives %s', (password, again, problem) => {
    expect(checkNewPassword(password, again)).toBe(problem);
  });

  it.each([
    ['short', undefined, 'phraseTooShort'],
    ['   short   ', undefined, 'phraseTooShort'],
    ['Gul-12345', 'gul-12345', 'phraseSameAsPassword'],
    [PHRASE, PASSWORD, null],
    [PHRASE, undefined, null],
  ])('phrase %j with password %j gives %s', (phrase, password, problem) => {
    expect(checkNewRecoveryPhrase(phrase, password)).toBe(problem);
  });
});
