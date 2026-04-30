import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: { timeout: 10000 },
  use: {
    headless: true,
    ...devices['Desktop Chrome'],
  },
});
