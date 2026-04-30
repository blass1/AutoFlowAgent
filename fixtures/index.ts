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
  // Las fixtures se agregan acá a medida que las generan los casos.
  // Ejemplo:
  //   loginPage: LoginPage;
};

export const test = base.extend<AutoFlowFixtures>({
  // Definiciones de fixtures.
  // Ejemplo:
  //   loginPage: async ({ page }, use) => {
  //     await page.goto('/');
  //     const login = new LoginPage(page);
  //     await login.estaVisible();
  //     await use(login);
  //   },
});

export { expect } from '@playwright/test';

// Los datos de prueba (usuarios, montos, búsquedas, etc.) viven en `data/` en la raíz.
// Importalos directo desde el spec: `import { usuarios } from '../data';`
