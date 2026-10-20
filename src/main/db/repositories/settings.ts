import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
  type SettingsUpdate,
} from '@shared/settings';
import type { Db } from '../connection';

/** Reads and writes rows of the key/value settings table. */
function createKeyValueStore(db: Db) {
  const selectAll = db.prepare<[], { key: string; value: string }>(
    'SELECT key, value FROM settings',
  );
  const upsert = db.prepare<[string, string]>(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET
       value = excluded.value,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  );
  const writeMany = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) upsert.run(key, value);
  });
  return {
    readAll: () => new Map(selectAll.all().map((row) => [row.key, row.value])),
    writeMany,
  };
}

/** Column `key` values in the settings table, as named in ARCHITECTURE.md. */
const STORAGE_KEYS: Record<keyof Settings, string> = {
  language: 'language',
  digitStyle: 'digit_style',
  themeMode: 'theme_mode',
  fontSize: 'font_size',
};
const SETTING_NAMES = Object.keys(STORAGE_KEYS) as (keyof Settings)[];

export interface SettingsRepository {
  getAll(): Settings;
  update(changes: SettingsUpdate): Settings;
}

export function createSettingsRepository(db: Db): SettingsRepository {
  const store = createKeyValueStore(db);

  function getAll(): Settings {
    const stored = store.readAll();
    const read = <K extends keyof Settings>(name: K): Settings[K] => {
      // A missing or unreadable value falls back to the default instead of breaking the app.
      const parsed = settingsSchema.shape[name].safeParse(stored.get(STORAGE_KEYS[name]));
      return parsed.success ? (parsed.data as Settings[K]) : DEFAULT_SETTINGS[name];
    };
    return Object.fromEntries(SETTING_NAMES.map((name) => [name, read(name)])) as Settings;
  }

  return {
    getAll,
    update(changes) {
      store.writeMany(
        SETTING_NAMES.flatMap((name) => {
          const value = changes[name];
          return value === undefined ? [] : [[STORAGE_KEYS[name], value] as [string, string]];
        }),
      );
      return getAll();
    },
  };
}

/** A salted scrypt hash. The secret itself is never stored. */
export interface StoredSecret {
  hash: string;
  salt: string;
}

export interface Credentials {
  password: StoredSecret;
  recoveryPhrase: StoredSecret;
}

const CREDENTIAL_KEYS = {
  password: { hash: 'password_hash', salt: 'password_salt' },
  recoveryPhrase: { hash: 'recovery_hash', salt: 'recovery_salt' },
} as const;

/**
 * The password and recovery phrase hashes. Kept apart from the normal settings
 * so they can never be sent to the screen by mistake.
 */
export interface CredentialsRepository {
  /** Null until the owner has created a password. */
  get(): Credentials | null;
  save(changes: Partial<Credentials>): void;
}

export function createCredentialsRepository(db: Db): CredentialsRepository {
  const store = createKeyValueStore(db);
  return {
    get() {
      const stored = store.readAll();
      const read = (keys: { hash: string; salt: string }): StoredSecret | null => {
        const hash = stored.get(keys.hash);
        const salt = stored.get(keys.salt);
        return hash && salt ? { hash, salt } : null;
      };
      const password = read(CREDENTIAL_KEYS.password);
      const recoveryPhrase = read(CREDENTIAL_KEYS.recoveryPhrase);
      return password && recoveryPhrase ? { password, recoveryPhrase } : null;
    },
    save(changes) {
      const entries: [string, string][] = [];
      for (const name of ['password', 'recoveryPhrase'] as const) {
        const secret = changes[name];
        if (!secret) continue;
        entries.push([CREDENTIAL_KEYS[name].hash, secret.hash]);
        entries.push([CREDENTIAL_KEYS[name].salt, secret.salt]);
      }
      store.writeMany(entries);
    },
  };
}
