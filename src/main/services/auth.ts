import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import {
  MAX_WRONG_ATTEMPTS,
  normalizePassword,
  normalizeRecoveryPhrase,
  WAIT_AFTER_WRONG_ATTEMPTS_MS,
  type AuthStatus,
  type ChangePasswordInput,
  type ChangeRecoveryPhraseInput,
  type RecoverInput,
  type SecretCheckResult,
  type SetupInput,
} from '@shared/auth';
import type { CredentialsRepository, StoredSecret } from '../db/repositories/settings';

// scrypt cost: about 0.1 s per check on a normal laptop, slow enough to make guessing expensive.
const HASH_FORMAT = 'scrypt1';
const SCRYPT_OPTIONS: ScryptOptions = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Hashes a secret with a new random salt. */
export async function hashSecret(secret: string): Promise<StoredSecret> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(secret, salt);
  return { hash: `${HASH_FORMAT}:${key.toString('base64')}`, salt: salt.toString('base64') };
}

/** Compares a secret with a stored hash in constant time. */
export async function verifySecret(secret: string, stored: StoredSecret): Promise<boolean> {
  const [format, encoded] = stored.hash.split(':');
  if (format !== HASH_FORMAT || !encoded) return false;
  const expected = Buffer.from(encoded, 'base64');
  const actual = await deriveKey(secret, Buffer.from(stored.salt, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Counts wrong passwords and recovery phrases together. After five wrong
 * tries in a row, every check is refused for 30 seconds, then five more tries
 * are allowed.
 */
export function createAttemptLimiter(now: () => number) {
  let failures = 0;
  let blockedUntil = 0;
  return {
    waitSeconds(): number {
      return Math.max(0, Math.ceil((blockedUntil - now()) / 1000));
    },
    /** Records a wrong try and returns how many are left before the wait (0 = waiting now). */
    fail(): number {
      failures += 1;
      if (failures < MAX_WRONG_ATTEMPTS) return MAX_WRONG_ATTEMPTS - failures;
      failures = 0;
      blockedUntil = now() + WAIT_AFTER_WRONG_ATTEMPTS_MS;
      return 0;
    },
    succeed(): void {
      failures = 0;
    },
  };
}

export type SetupResult = { ok: true } | { ok: false; reason: 'already_set' };

/**
 * Locks the app behind a password. There are no sessions or timeouts: once
 * unlocked, the app stays unlocked until it is closed.
 */
export function createAuthService(
  credentials: CredentialsRepository,
  now: () => number = Date.now,
) {
  const limiter = createAttemptLimiter(now);
  let unlocked = false;

  /** Runs a check through the 5-tries rule; `onSuccess` runs only when it passes. */
  async function guardedCheck(
    check: () => Promise<boolean>,
    onSuccess: () => Promise<void> | void,
  ): Promise<SecretCheckResult> {
    const waitSeconds = limiter.waitSeconds();
    if (waitSeconds > 0) return { ok: false, reason: 'wait', waitSeconds };
    if (!(await check())) {
      const attemptsLeft = limiter.fail();
      return attemptsLeft === 0
        ? { ok: false, reason: 'wait', waitSeconds: limiter.waitSeconds() }
        : { ok: false, reason: 'wrong', attemptsLeft };
    }
    limiter.succeed();
    await onSuccess();
    return { ok: true };
  }

  function stored() {
    const current = credentials.get();
    if (!current) throw new Error('No password has been set up');
    return current;
  }

  const checkPassword = (password: string) => () =>
    verifySecret(normalizePassword(password), stored().password);

  return {
    status(): AuthStatus {
      if (unlocked) return 'unlocked';
      return credentials.get() ? 'locked' : 'setup';
    },

    isUnlocked: () => unlocked,

    async setup({ password, recoveryPhrase }: SetupInput): Promise<SetupResult> {
      if (credentials.get()) return { ok: false, reason: 'already_set' };
      const [passwordHash, recoveryHash] = await Promise.all([
        hashSecret(normalizePassword(password)),
        hashSecret(normalizeRecoveryPhrase(recoveryPhrase)),
      ]);
      credentials.save({ password: passwordHash, recoveryPhrase: recoveryHash });
      unlocked = true;
      return { ok: true };
    },

    unlock(password: string): Promise<SecretCheckResult> {
      return guardedCheck(checkPassword(password), () => {
        unlocked = true;
      });
    },

    recover({ recoveryPhrase, newPassword }: RecoverInput): Promise<SecretCheckResult> {
      return guardedCheck(
        () => verifySecret(normalizeRecoveryPhrase(recoveryPhrase), stored().recoveryPhrase),
        async () => {
          credentials.save({ password: await hashSecret(normalizePassword(newPassword)) });
          unlocked = true;
        },
      );
    },

    changePassword({
      currentPassword,
      newPassword,
    }: ChangePasswordInput): Promise<SecretCheckResult> {
      return guardedCheck(checkPassword(currentPassword), async () => {
        credentials.save({ password: await hashSecret(normalizePassword(newPassword)) });
      });
    },

    changeRecoveryPhrase({
      currentPassword,
      newRecoveryPhrase,
    }: ChangeRecoveryPhraseInput): Promise<SecretCheckResult> {
      return guardedCheck(checkPassword(currentPassword), async () => {
        credentials.save({
          recoveryPhrase: await hashSecret(normalizeRecoveryPhrase(newRecoveryPhrase)),
        });
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
