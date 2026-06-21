import { defineConfig } from 'vitest/config';

/**
 * Vitest config — DEV-ONLY. The app (Metro/Expo Go) never imports this file or
 * any test, so it cannot affect the SDK 54 bundle. Tests target the pure engine.
 *
 * `globals: false` (the default) is intentional: tests use explicit
 * `import { describe, it, expect } from 'vitest'` so vitest's globals never leak
 * into the app's strict TypeScript global scope.
 */
export default defineConfig({
  test: {
    globals: false,
    include: ['src/engine/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
