import { test as base } from '@playwright/test';

/**
 * Fixtures comunes de AutoFlow.
 *
 * El agente AutoFlow extiende este archivo cuando un caso necesita una fixture
 * nueva (por ejemplo, un Page Object pre-cargado o un usuario logueado).
 *
 * Convención: nada de clases base ni `BaseTest`. Solo `test.extend`.
 */

/** Almacén de valores capturados durante un test (nodos `capturar` / `verificar`).
 *  Es per-test: cada test arranca con un Map vacío. */
export interface Vars {
  set(key: string, value: unknown): void;
  get<T = unknown>(key: string): T;
  has(key: string): boolean;
}

type AutoFlowFixtures = {
  /** Aplica un delay opcional después de cada acción para frontends lentos.
   *  Activado vía env var AUTOFLOW_DELAY_MS (entero, ms). Si no está seteada, no hace nada. */
  humanize: (accion?: () => Promise<void>) => Promise<void>;
  /** Almacén de valores capturados por nodos `capturar`. Per-test. */
  vars: Vars;
  // Otras fixtures se agregan acá a medida que las generan los casos.
  // Ejemplo:
  //   loginPage: LoginPage;
};

export const test = base.extend<AutoFlowFixtures>({
  humanize: async ({ page }, use) => {
    const delayMs = Number.parseInt(process.env.AUTOFLOW_DELAY_MS ?? '0', 10);
    const aplicar = async (accion?: () => Promise<void>) => {
      if (accion) await accion();
      if (delayMs > 0) await page.waitForTimeout(delayMs);
    };
    await use(aplicar);
  },
  vars: async ({}, use) => {
    const store = new Map<string, unknown>();
    const api: Vars = {
      set: (k, v) => { store.set(k, v); },
      get: <T,>(k: string) => {
        if (!store.has(k)) {
          throw new Error(`vars.get('${k}'): variable no capturada en este test`);
        }
        return store.get(k) as T;
      },
      has: (k) => store.has(k),
    };
    await use(api);
  },
  // Otras definiciones de fixtures van acá.
});

export { expect } from '@playwright/test';

// Los datos de prueba viven en `data/` en la raíz:
//   - data/usuarios.ts      → catálogo de usuarios reusables (interface User).
//   - data/data-{slug}.ts   → datos del test set, referenciando a `usuarios`.
// Importalos desde el spec: `import { dataRegresionDeCompras } from '../data';`
