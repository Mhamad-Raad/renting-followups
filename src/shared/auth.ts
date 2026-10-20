import { z } from 'zod';
import { normalizeText } from './normalizeText';

export const MIN_PASSWORD_LENGTH = 4;
export const MIN_RECOVERY_PHRASE_LENGTH = 8;
const MAX_SECRET_LENGTH = 200;

/** After this many wrong tries, the owner must wait before trying again. */
export const MAX_WRONG_ATTEMPTS = 5;
export const WAIT_AFTER_WRONG_ATTEMPTS_MS = 30_000;

/** Where the app is when it starts: no password yet, locked, or open. */
export type AuthStatus = 'setup' | 'locked' | 'unlocked';

/** The answer to anything that checks a password or recovery phrase. */
export type SecretCheckResult =
  | { ok: true }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'wait'; waitSeconds: number };

/**
 * The password is compared exactly, as typed. The recovery phrase is written
 * on paper and typed again much later, so it is compared forgivingly: case,
 * extra spaces and Arabic/Kurdish letter variants do not matter.
 */
export function normalizePassword(password: string): string {
  return password.normalize('NFC');
}

export function normalizeRecoveryPhrase(phrase: string): string {
  return normalizeText(phrase);
}

const password = z
  .string()
  .max(MAX_SECRET_LENGTH)
  .refine((value) => normalizePassword(value).length >= MIN_PASSWORD_LENGTH);
const recoveryPhrase = z
  .string()
  .max(MAX_SECRET_LENGTH)
  .refine((value) => normalizeRecoveryPhrase(value).length >= MIN_RECOVERY_PHRASE_LENGTH);
// Checking an existing secret never rejects by length: a wrong secret is just wrong.
const anySecret = z.string().max(MAX_SECRET_LENGTH);

export const setupInputSchema = z.object({ password, recoveryPhrase }).strict();
export const unlockInputSchema = z.object({ password: anySecret }).strict();
export const recoverInputSchema = z
  .object({ recoveryPhrase: anySecret, newPassword: password })
  .strict();
export const changePasswordInputSchema = z
  .object({ currentPassword: anySecret, newPassword: password })
  .strict();
export const changeRecoveryPhraseInputSchema = z
  .object({ currentPassword: anySecret, newRecoveryPhrase: recoveryPhrase })
  .strict();

export type SetupInput = z.infer<typeof setupInputSchema>;
export type UnlockInput = z.infer<typeof unlockInputSchema>;
export type RecoverInput = z.infer<typeof recoverInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
export type ChangeRecoveryPhraseInput = z.infer<typeof changeRecoveryPhraseInputSchema>;

export type NewSecretProblem =
  'passwordTooShort' | 'passwordsDiffer' | 'phraseTooShort' | 'phraseSameAsPassword';

/** Checks a new password typed twice. Returns the first problem, or null when it is fine. */
export function checkNewPassword(password: string, again: string): NewSecretProblem | null {
  if (normalizePassword(password).length < MIN_PASSWORD_LENGTH) return 'passwordTooShort';
  if (normalizePassword(password) !== normalizePassword(again)) return 'passwordsDiffer';
  return null;
}

/** Checks a new recovery phrase; it must not simply repeat the password. */
export function checkNewRecoveryPhrase(phrase: string, password?: string): NewSecretProblem | null {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (normalized.length < MIN_RECOVERY_PHRASE_LENGTH) return 'phraseTooShort';
  if (password !== undefined && normalized === normalizeRecoveryPhrase(password)) {
    return 'phraseSameAsPassword';
  }
  return null;
}
