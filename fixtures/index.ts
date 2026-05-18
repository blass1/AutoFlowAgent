import { test as base, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Buffer anti-solape (500ms por default) que el agente intercala entre acciones
 * de input/selección dentro de un método de PO cuando `session.bufferTiempo: true`.
 * El valor se puede sobreescribir con la env var `AUTOFLOW_BUFFER_MS` (entero).
 *
 * Centralizar el valor en un solo lugar en lugar de tener `waitForTimeout(500)`
 * literal en cada PO permite ajustar el buffer global del proyecto sin tocar
 * cada Page Object. Ver `.autoflow/conventions/pom-rules.md` → "Buffer de tiempo".
 */
export async function bufferEntreAcciones(page: Page): Promise<void> {
  const ms = Number.parseInt(process.env.AUTOFLOW_BUFFER_MS ?? '500', 10);
  if (ms > 0) await page.waitForTimeout(ms);
}

/**
 * Captura un screenshot JPEG (quality 60, viewport only — priorizamos espacio
 * sobre calidad) en la carpeta de la corrida actual. Lo invoca el agente desde
 * los métodos de PO en puntos clave (antes/después de botones de confirmación,
 * pantallas principales) o el QA manualmente vía "Insertar screenshot" en
 * editar-caso.
 *
 * Comportamiento:
 *  - Espera `domcontentloaded` y un short tick para estabilizar el render.
 *  - Si detecta `[aria-busy=true]` visible, espera hasta 3s a que desaparezca.
 *  - Lee `process.env.AUTOFLOW_RUN_DIR` (lo setean los wrappers run-test.js /
 *    run-testset.js o el reporter `lib/run-reporter.js` en onBegin). Si no
 *    está seteado, retorna `null` silencioso — el test no se rompe.
 *  - Guarda en `{AUTOFLOW_RUN_DIR}/screens/{label}_DD_MM_YYYY_HH_MM_SS.jpg`.
 *  - Si el filename ya existe (colisión por mismo segundo), agrega sufijo
 *    `_1`, `_2`, ... hasta encontrar uno libre.
 *
 * No bloquea ni rompe el test ante errores — el screenshot es accesorio.
 */
export async function screen(page: Page, label: string): Promise<string | null> {
  const runDir = process.env.AUTOFLOW_RUN_DIR;
  if (!runDir) return null;

  try {
    // 1. Esperá que el DOM esté listo. `domcontentloaded` evita esperar
    //    long-polling / WebSocket persistente que nunca completa.
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    // 2. Si el front marca aria-busy, esperá hasta 3s a que termine.
    //    Best-effort — si el selector no matchea, seguimos sin esperar.
    try {
      const busy = page.locator('[aria-busy="true"]:visible').first();
      if (await busy.count().catch(() => 0)) {
        await busy.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      }
    } catch { /* no-op */ }

    // 3. Resolvé testId del test actual via test.info() — agrupa screens en
    //    sub-carpeta por testId para evitar colisiones cuando un testset
    //    corre tests en paralelo (cada worker escribiría al mismo folder).
    let testId = '_unknown';
    try {
      const info = base.info();
      const m = info?.title?.match(/\[testId:(\d+)\]/);
      if (m) testId = m[1];
    } catch { /* fuera de un test context — usar _unknown */ }

    const { formatScreenTimestamp } = require('../.autoflow/scripts/lib/run-timestamp');
    const ts = formatScreenTimestamp();
    const screensDir = join(runDir, 'screens', testId);
    if (!existsSync(screensDir)) mkdirSync(screensDir, { recursive: true });

    const safeLabel = String(label || 'Screen').replace(/[^A-Za-z0-9_-]/g, '_');
    let outPath = join(screensDir, `${safeLabel}_${ts}.jpg`);

    // 4. Sufijo numérico si el filename ya existe (mismo segundo, mismo label).
    let suffix = 1;
    while (existsSync(outPath)) {
      outPath = join(screensDir, `${safeLabel}_${ts}_${suffix}.jpg`);
      suffix++;
    }

    // 5. JPEG quality 60, viewport only (no fullPage) — priorizamos espacio.
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 60, fullPage: false });
    return outPath;
  } catch {
    // Best-effort: cualquier error se traga (screen es accesorio).
    return null;
  }
}

/**
 * Fixtures comunes de AutoFlow.
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
  /** Fixture auto que captura evidencia (network 4xx/5xx, console errors,
   *  selectores de error visibles, DOM text) durante el test y la vuelca a
   *  `{AUTOFLOW_RUN_DIR}/failures/{testId}.json` cuando el test falla. La consume
   *  el clasificador (.autoflow/scripts/lib/clasificar-error.js) para emitir el
   *  campo `motivo` en el AUTOFLOW_RESULT. Si el test pasa, no escribe nada. */
  errorCapture: void;
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
  errorCapture: [async ({ page }, use, testInfo) => {
    // Listeners pasivos durante toda la vida del test. Capturamos en memoria;
    // si el test pasa, descartamos todo. Si falla, volcamos failure.json.
    const failedRequests: { url: string; status: number; method: string; body: string }[] = [];
    const consoleErrors: string[] = [];

    const onResponse = async (resp: import('@playwright/test').Response) => {
      const status = resp.status();
      if (status < 400) return;
      let body = '';
      try { body = (await resp.text()).slice(0, 2000); } catch { /* response body consumido o stream cerrado */ }
      failedRequests.push({
        url: resp.url(),
        status,
        method: resp.request().method(),
        body,
      });
    };
    const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 500));
    };
    page.on('response', onResponse);
    page.on('console', onConsole);

    await use();

    page.off('response', onResponse);
    page.off('console', onConsole);

    // Si el test pasó, no escribimos nada — la evidencia solo sirve para fallos.
    if (testInfo.status === 'passed' || testInfo.status === 'skipped') return;

    const runDir = process.env.AUTOFLOW_RUN_DIR;
    if (!runDir) return;

    // Selectores típicos de "algo salió mal en la UI". Mantener en sync con el
    // catálogo .autoflow/conventions/error-patterns.json — los que matchean acá
    // alimentan el matcher `selectorVisible`.
    const ERROR_SELECTORS = [
      '.modal-error',
      "[role='alertdialog']",
      '.alert-danger',
      '.toast-error',
      "[data-testid='error-modal']",
    ];
    const visibleErrorSelectors: string[] = [];
    let domSnapshot = '';
    try {
      for (const sel of ERROR_SELECTORS) {
        try {
          // `isVisible()` es non-retrying: chequea el estado actual del DOM sin
          // esperar. Justo lo que queremos — captura el "instante del fallo".
          const visible = await page.locator(sel).first().isVisible().catch(() => false);
          if (visible) visibleErrorSelectors.push(sel);
        } catch { /* selector inválido o página ya cerrada */ }
      }
      domSnapshot = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) ?? '').catch(() => '');
    } catch { /* página cerrada antes de poder leer */ }

    const testIdMatch = testInfo.title.match(/\[testId:(\d+)\]/);
    const testId = testIdMatch ? testIdMatch[1] : '_unknown';

    const failuresDir = join(runDir, 'failures');
    try { if (!existsSync(failuresDir)) mkdirSync(failuresDir, { recursive: true }); } catch { return; }

    const payload = {
      testId,
      title: testInfo.title,
      status: testInfo.status,
      error: testInfo.error ? {
        message: testInfo.error.message ?? '',
        stack: testInfo.error.stack ?? '',
      } : null,
      failedRequests,
      consoleErrors,
      visibleErrorSelectors,
      domSnapshot,
      timestamp: new Date().toISOString(),
    };

    try {
      writeFileSync(join(failuresDir, `${testId}.json`), JSON.stringify(payload, null, 2), 'utf8');
    } catch { /* accesorio — si falla, el clasificador cae a "no clasificado" */ }
  }, { auto: true }],
  // Otras definiciones de fixtures van acá.
});

export { expect } from '@playwright/test';

// Los datos de prueba viven en `data/` en la raíz:
//   - data/types.ts         → interfaces compartidas (User, Canal).
//   - data/urls.ts          → catálogo de canales (nombre + URL inicial).
//   - data/data-{slug}.ts   → datos autocontenidos del Test Set (interface + usuarios + valores).
// Importalos desde el spec: `import { dataDolarMep } from '../data';`
