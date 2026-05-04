import { test as base } from '@playwright/test';

/**
 * Fixtures comunes de AutoFlow.
 *
 * El agente AutoFlow extiende este archivo cuando un caso necesita una fixture
 * nueva (por ejemplo, un Page Object pre-cargado o un usuario logueado).
 *
 * Convención: nada de clases base ni `BaseTest`. Solo `test.extend`.
 */

type AutoFlowFixtures = {
  /** Aplica un delay opcional después de cada acción para frontends lentos.
   *  Activado vía env var AUTOFLOW_DELAY_MS (entero, ms). Si no está seteada, no hace nada. */
  humanize: (accion?: () => Promise<void>) => Promise<void>;
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
  // Otras definiciones de fixtures van acá.
});

export { expect } from '@playwright/test';

// Los datos de prueba viven en `data/` en la raíz:
//   - data/usuarios.ts      → catálogo de usuarios reusables (interface User).
//   - data/data-{slug}.ts   → datos del test set, referenciando a `usuarios`.
// Importalos desde el spec: `import { dataRegresionDeCompras } from '../data';`
