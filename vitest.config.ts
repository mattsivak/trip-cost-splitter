import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    // e2e/ is Playwright's, and its *.spec.ts files match vitest's default
    // glob. Without this, `npm test` tries to run them and fails.
    exclude: ['node_modules/**', '.nuxt/**', '.output/**', 'e2e/**'],
  },
  resolve: {
    alias: {
      '~': new URL('./', import.meta.url).pathname,
      '@': new URL('./', import.meta.url).pathname,
    },
  },
})
