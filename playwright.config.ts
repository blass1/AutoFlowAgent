import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 180000,
  expect: { timeout: 15000 },
  use: {
    headless: true,
    actionTimeout: 60000,
    navigationTimeout: 60000,
    ...devices['Desktop Chrome'],
  },
});
