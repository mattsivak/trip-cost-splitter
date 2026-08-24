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
    command: `npm run build && PORT=${PORT} node .output/server/index.mjs`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
