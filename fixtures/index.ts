import { test as base, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
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
//   - data/types.ts         → interfaces compartidas (User, Canal).
//   - data/urls.ts          → catálogo de canales (nombre + URL inicial).
//   - data/data-{slug}.ts   → datos autocontenidos del Test Set (interface + usuarios + valores).
// Importalos desde el spec: `import { dataDolarMep } from '../data';`
