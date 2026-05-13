// Resetea el proyecto al estado anterior a cualquier sesión de AutoFlow:
// borra todo lo que el agente haya generado (recordings, pages, tests, fingerprints,
// testsets, nodos, grafos, captures, runs, auth, dashboards, data de Tests, screens,
// PDFs, outputs de ALM).
//
// **Preserva**:
//   - `node_modules/` (el script no lo toca)
//   - `.autoflow/user.json` (identidad del QA — se conserva para no rehacer onboarding)
//   - `.autoflow/alm/integrations/*.exe` (binarios propietarios — NO generados por el agente)
//   - Seeds de `data/` (`types.ts`, `parsers.ts`, `index.ts` reset, `urls.ts` reset)
//   - Prompts, scripts, conventions, fixtures, configs, utils, `.gitkeep`
//
//  Uso:
//   node .autoflow/clearSession.js          (pide confirmación interactiva)
//   node .autoflow/clearSession.js --yes    (sin confirmación, para CI/scripting)

const { readdirSync, rmSync, existsSync, statSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const readline = require('node:readline');

// El script vive en `.autoflow/`, pero todos los paths abajo son relativos a la
// raíz del proyecto. Forzamos cwd a la raíz para que funcione desde cualquier ubicación.
process.chdir(resolve(__dirname, '..'));

const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

// Archivos individuales a borrar.
//
// NO incluye `.autoflow/user.json` — la identidad del QA se preserva por diseño.
// Si querés borrarla también, hacelo a mano: `rm .autoflow/user.json`.
const archivos = [
  '.autoflow/nodos.json',
  '.autoflow/dashboard.html',       // HTML estático generado por dashboard.js
  '.autoflow/utils-applied.json',   // state de utilidades de utils/ aplicadas
  '.autoflow/grafo.md',             // legado (versión anterior, antes de mover a grafos/)
  '.autoflow/grafo-nodos.md',       // legado
];

// Carpetas a vaciar (top-level only — borra archivos sueltos, deja subdirectorios
// como están). Si una carpeta también tiene subcarpetas a limpiar, va en
// `carpetasAVaciarRecursivo` abajo.
const carpetasAVaciar = [
  '.autoflow/recordings',
  '.autoflow/fingerprints',
  '.autoflow/testsets',
  '.autoflow/grafos',
  '.autoflow/auth',                 // storageStates — sensibles (re-grabar el login)
  '.autoflow/alm-exports',          // xlsx del QA para "Importar XLSX"
  '.autoflow/alm/originalTests',    // cache del fetch_test_*.exe
  '.autoflow/alm/exports',          // outputs del humanizador (JSON + xlsx + .md)
  'pages',                          // Page Objects generados
  'tests',                          // specs generados (tests/_temp/ se trata aparte recursivo)
];

// Carpetas a vaciar recursivamente (también borra subcarpetas anidadas, pero
// mantiene la carpeta raíz y su `.gitkeep` si tenía).
//
// Las usamos para carpetas que el agente o las corridas generan con estructura
// anidada que cambia entre runs (ej: `runs/{ts}/screens/{testId}/`, `captures/{numero}/`).
const carpetasAVaciarRecursivo = [
  '.autoflow/captures',             // HTML+intent por nodo, sub-carpeta por numero
  '.autoflow/runs',                 // run JSONs + sub-carpetas diarias ResultsALM
  'runs',                           // raíz: sub-carpetas por corrida con screens + PDFs
  'tests/_temp',                    // specs efímeros (page.pause, auth setup, etc.)
  'playwright-report',              // HTML report cuando se corrió con --debug
  'test-results',                   // outputDir default de Playwright (sin AUTOFLOW_RUN_DIR)
  'blob-report',                    // formato blob (raro pero puede aparecer)
];

// `data/` recibe trato especial: se borra todo menos los seeds del proyecto
// (`index.ts`, `types.ts`, `urls.ts`, `parsers.ts`), que se resetean a su estado inicial.
// Cada test set vive en su propio `data-{slug}.ts` autocontenido (usuarios + datos + interface) y se borra.
const dataDir = 'data';
const dataSeeds = new Set(['index.ts', 'types.ts', 'urls.ts', 'parsers.ts']);

// Contenido inicial de los seeds de `data/`.
const SEED_INDEX = `export * from './types';
export * from './urls';
export * from './parsers';

// Cada test set agrega su propio archivo \`data-{slug}.ts\` (autocontenido: interface + usuarios + datos)
// y suma una línea acá:
//   export * from './data-{slug}';
`;

const SEED_URLS = `import type { Canal } from './types';

/**
 * Catálogo de canales (nombre + URL inicial) reusables al crear casos.
 * El agente AutoFlow agrega entradas acá cuando el QA elige "Crear nuevo canal".
 */
export const canales: readonly Canal[] = [];
`;

// No tocar archivos del proyecto que viven dentro de las carpetas a vaciar
// (típicamente .gitkeep para mantener la carpeta versionada).
function esPreservado(nombre) {
  return nombre === '.gitkeep';
}

function listarObjetivos() {
  const objetivos = [];

  for (const a of archivos) {
    if (existsSync(a)) objetivos.push(a);
  }

  for (const dir of carpetasAVaciar) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isFile() && !esPreservado(f)) objetivos.push(p);
    }
  }

  // Las carpetas recursivas listan todo su contenido (files + subdirs) excepto
  // `.gitkeep`. Cada entrada del top-level se va a borrar con `rmSync recursive`,
  // así que la listamos una sola vez aunque sea carpeta.
  for (const dir of carpetasAVaciarRecursivo) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (!esPreservado(f)) objetivos.push(p);
    }
  }

  if (existsSync(dataDir)) {
    for (const f of readdirSync(dataDir)) {
      if (dataSeeds.has(f)) continue;
      const p = join(dataDir, f);
      if (statSync(p).isFile() && !esPreservado(f)) objetivos.push(p);
    }
  }

  return objetivos;
}

function ejecutarBorrado() {
  let borrados = 0;
  for (const a of archivos) {
    if (existsSync(a)) {
      rmSync(a);
      borrados++;
    }
  }
  for (const dir of carpetasAVaciar) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isFile() && !esPreservado(f)) {
        rmSync(p);
        borrados++;
      }
    }
  }
  // Para las carpetas recursivas, borramos cada entrada del top-level con
  // `rmSync recursive: true` — esto se lleva files Y sub-carpetas anidadas.
  // Preservamos `.gitkeep` así la carpeta raíz queda versionada.
  for (const dir of carpetasAVaciarRecursivo) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (esPreservado(f)) continue;
      const p = join(dir, f);
      rmSync(p, { recursive: true, force: true });
      borrados++;
    }
  }
  if (existsSync(dataDir)) {
    for (const f of readdirSync(dataDir)) {
      if (dataSeeds.has(f)) continue;
      const p = join(dataDir, f);
      if (statSync(p).isFile() && !esPreservado(f)) {
        rmSync(p);
        borrados++;
      }
    }
    // Reset de seeds a su estado inicial.
    if (existsSync(join(dataDir, 'index.ts'))) {
      writeFileSync(join(dataDir, 'index.ts'), SEED_INDEX, 'utf8');
    }
    if (existsSync(join(dataDir, 'urls.ts'))) {
      writeFileSync(join(dataDir, 'urls.ts'), SEED_URLS, 'utf8');
    }
    // types.ts y parsers.ts son contrato puro, no se tocan.
  }
  return borrados;
}

function preguntar(mensaje) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(mensaje, (respuesta) => {
      rl.close();
      resolve(respuesta.trim());
    });
  });
}

(async () => {
  const objetivos = listarObjetivos();

  if (objetivos.length === 0) {
    console.log('✨ El proyecto ya está limpio. Nada para borrar.');
    return;
  }

  console.log(`Se van a borrar ${objetivos.length} archivos/carpetas:`);
  for (const o of objetivos) console.log(`  • ${o}`);
  console.log('');
  console.log('Se preservan:');
  console.log('  • node_modules/');
  console.log('  • .autoflow/user.json (identidad del QA)');
  console.log('  • .autoflow/alm/integrations/*.exe (binarios propietarios)');
  console.log('  • Seeds de data/ (types.ts, parsers.ts intactos; index.ts y urls.ts se RESETEAN al contenido inicial)');
  console.log('  • Prompts, scripts, conventions, fixtures, configs, utils, .gitkeep');
  console.log('');

  if (!skipConfirm) {
    const respuesta = await preguntar('Escribí SI (mayúsculas) para confirmar: ');
    if (respuesta !== 'SI') {
      console.log('❌ Cancelado. No se borró nada.');
      process.exit(1);
    }
  }

  const borrados = ejecutarBorrado();
  console.log(`✅ Listo. ${borrados} archivos borrados. Proyecto reseteado.`);
})();
