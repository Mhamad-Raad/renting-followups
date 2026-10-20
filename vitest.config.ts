import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // The project has no unit tests until iteration 1; an empty run must still pass.
    passWithNoTests: true,
  },
});
