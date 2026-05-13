import { defineConfig, devices } from '@playwright/test';

// Si la corrida no vino de un wrapper (run-test.js / run-testset.js), no hay
// AUTOFLOW_RUN_DIR seteado y los workers no sabrían dónde volcar screens / PDF.
// Lo creamos acá — esto corre en el parent antes de forkear workers, así todos
// heredan la misma env var. Cubre `npx playwright test` directo, plugin de
// VSCode, debug, etc. Si el wrapper ya lo seteó, respetamos el valor existente.
if (!process.env.AUTOFLOW_RUN_DIR) {
  const { formatRunTimestamp } = require('./.autoflow/scripts/lib/run-timestamp');
  const { mkdirSync } = require('node:fs');
  const ts = formatRunTimestamp();
  process.env.AUTOFLOW_RUN_DIR = `runs/${ts}`;
  mkdirSync(process.env.AUTOFLOW_RUN_DIR, { recursive: true });
}

export default defineConfig({
  testDir: './tests',
  // tests/_temp/ alberga specs efímeros que el agente genera y borra al instante
  // (ej: page.pause() para inspección de locators, prueba de login reusable). Si
  // queda alguno colgado, no debe correr en suites generales.
  testIgnore: ['**/_temp/**'],
  timeout: 180000,
  expect: { timeout: 15000 },
  // Carpeta de artifacts (screenshots, traces, videos, attachments). Si los wrappers
  // run-test.js/run-testset.js setean AUTOFLOW_RUN_DIR=runs/{DD_MM_YYYY_HH-MM-SS},
  // Playwright vuelca todo ahí — así cada corrida queda en su propia carpeta y los
  // artifacts no se sobreescriben entre runs. Fallback a `test-results/` (default
  // de Playwright) cuando se invoca `npx playwright test ...` directo sin wrapper.
  outputDir: process.env.AUTOFLOW_RUN_DIR ?? 'test-results',
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
    // Screenshots automáticos al fallar un test. Quedan en `outputDir` (ver arriba),
    // por defecto `runs/{ts}/` cuando se invoca vía wrappers. Investigación de fallos
    // sin pedirle al QA que arme nada manual.
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
});
