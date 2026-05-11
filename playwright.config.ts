import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // tests/_temp/ alberga specs efímeros que el agente genera y borra al instante
  // (ej: page.pause() para inspección de locators, prueba de login reusable). Si
  // queda alguno colgado, no debe correr en suites generales.
  testIgnore: ['**/_temp/**'],
  timeout: 180000,
  expect: { timeout: 15000 },
  // Reporter `list` para output legible + reporter custom de AutoFlow que persiste
  // cada corrida en `.autoflow/runs/` para que el dashboard la muestre. El custom
  // se desactiva solo si la corrida vino de los wrappers run-test.js/run-testset.js
  // (esos persisten su propia entrada con más contexto).
  reporter: [
    ['list'],
    ['./.autoflow/scripts/lib/run-reporter.js'],
  ],
  use: {
    headless: true,
    // actionTimeout antes era 60s — un selector roto colgaba el test 60s antes de
    // fallar. 30s es suficiente para acciones intra-pantalla del front lento del banco
    // y deja feedback rápido cuando algo se rompe.
    actionTimeout: 30000,
    // navigationTimeout queda en 60s: el banco tiene cargas iniciales pesadas y
    // bajarlo causa falsos positivos.
    navigationTimeout: 60000,
    ...devices['Desktop Chrome'],
  },
});
