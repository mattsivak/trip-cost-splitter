import { defineConfig, devices } from '@playwright/test'

const PORT = 3123

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The full Chromium build, not the headless shell: the shell starts a
        // native drag but never delivers dragover or drop, so drag-and-drop
        // cannot be tested on it.
        channel: 'chromium',
      },
    },
  ],
  webServer: {
    // Runs against the real build, not the dev server: these tests exist to
    // check what actually ships.
    //
    // It builds into its own directory, so a dev server can stay open while
    // the tests run: sharing `.nuxt` meant the build wiped `dist` underneath
    // it and it restarted mid-edit, and sharing the lock meant it could not
    // start at all.
    command: `NUXT_TEST_BUILD=1 NUXT_IGNORE_LOCK=1 npm run build && PORT=${PORT} node .output-test/server/index.mjs`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
