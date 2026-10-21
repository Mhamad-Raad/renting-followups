import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'src/shared') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // The persistent cache keys a file by its own content, so the migration list
    // (built from the folder's .sql files) would miss newly added migrations.
    fsModuleCache: false,
  },
});
