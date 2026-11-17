import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testIgnore: ['**/unit/**'],
  timeout: 30_000,
  retries: 1,
  use: {
    // Base URL can be set with BASE_URL env var; defaults to localhost:3000
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    // Use an installed browser instead of a downloaded one, e.g. PW_CHANNEL=chrome or msedge
    channel: process.env.PW_CHANNEL || undefined,
    actionTimeout: 10_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
