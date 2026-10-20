import { loadMigrations } from '../migrate';

/** Every numbered .sql file in this folder, in order. */
export const MIGRATIONS = loadMigrations(
  import.meta.glob<string>('./*.sql', { query: '?raw', import: 'default', eager: true }),
);
