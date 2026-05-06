import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // tests/_temp/ alberga specs efímeros que el agente genera y borra al instante
  // (ej: page.pause() para inspección de locators, prueba de login reusable). Si
  // queda alguno colgado, no debe correr en suites generales.
  testIgnore: ['**/_temp/**'],
  timeout: 180000,
  expect: { timeout: 15000 },
  use: {
    headless: true,
    actionTimeout: 60000,
    navigationTimeout: 60000,
    ...devices['Desktop Chrome'],
  },
});
