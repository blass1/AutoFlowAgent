// Corre todos los casos de un test set y reporta un resumen estructurado.
//
// Por defecto usa --reporter=line (rápido, sin overhead de HTML/trace en cada
// corrida). Pasale --debug para sumar reporter html + trace=on.
//
// Uso: node .autoflow/scripts/run-testset.js <slug> [--headed] [--headless] [--debug]

const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { formatRunTimestamp } = require('./lib/run-timestamp');

const slug = process.argv[2];
const headed = process.argv.includes('--headed');
const debug = process.argv.includes('--debug');
if (!slug) {
  console.error('Uso: node .autoflow/scripts/run-testset.js <slug> [--headed]');
  process.exit(1);
}

const setPath = join('.autoflow/testsets', `${slug}.json`);
if (!existsSync(setPath)) {
  console.error(`❌ No encuentro ${setPath}.`);
  process.exit(1);
}

const set = JSON.parse(readFileSync(setPath, 'utf8'));
// Resolución de specPath con 3 niveles de fallback (raíz → dentro de casos[] → canónico
// derivado de slug+id). El último cubre el caso de testsets cuyo JSON quedó mal armado
// por el agente y aún no lo detectaron a tiempo.
const specPathCanonico = set.slug && set.id ? `tests/${set.slug}-${set.id}.spec.ts` : null;
const specPathFinal = set.specPath ?? set.casos?.[0]?.specPath ?? specPathCanonico;
if (!specPathFinal) {
  console.error('❌ El test set no tiene specPath y no se puede inferir (faltan slug y/o id). Esperado: tests/{slug}-{id}.spec.ts');
  process.exit(1);
}
if (!existsSync(specPathFinal)) {
  console.error(`❌ No encuentro el spec ${specPathFinal}.`);
  process.exit(1);
}
set.specPath = specPathFinal; // Para que el resto del script lo use sin cambiar referencias.

const totalCasos = Array.isArray(set.casos) ? set.casos.length : 0;
console.log(`🚀 Corriendo "${set.nombre}" (${totalCasos} casos en ${set.specPath})`);
console.log('');

// Carpeta de artifacts por corrida: `runs/{DD_MM_YYYY_HH-MM-SS}/`. Playwright
// vuelca screenshots/traces/videos ahí vía `outputDir` (ver playwright.config.ts).
const runTimestamp = formatRunTimestamp();
const artifactsDir = `runs/${runTimestamp}`;
mkdirSync(artifactsDir, { recursive: true });

const inicio = Date.now();
// Reporter `line` por default (rápido). `--debug` suma html + trace=on cuando el
// agente quiere investigar después de un fallo.
//
// IMPORTANTE: incluímos el reporter custom `./.autoflow/scripts/lib/run-reporter.js`
// en la lista. Cuando `--reporter` se pasa por CLI, Playwright OVERRIDEA el array
// del config — sin esto, el reporter custom no corre, no se escribe `pdf-context.json`
// y no se appendea a `ResultsALM.json` cuando la corrida viene del wrapper.
const REPORTER_CUSTOM = './.autoflow/scripts/lib/run-reporter.js';
const args = ['playwright', 'test', set.specPath, `--reporter=line,${REPORTER_CUSTOM}`];
if (debug) {
  args[args.length - 1] = `--reporter=line,html,${REPORTER_CUSTOM}`;
  args.push('--trace=on');
}
if (headed) args.push('--headed', '--workers=1');
// AUTOFLOW_RUN_PERSISTED desactiva el reporter custom para evitar runs duplicados.
// AUTOFLOW_RUN_DIR le dice a playwright.config.ts dónde volcar los artifacts.
const res = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, AUTOFLOW_RUN_PERSISTED: '1', AUTOFLOW_RUN_DIR: artifactsDir },
});
const duration = Date.now() - inicio;
const exitCode = res.status ?? 1;

// Generar el PDF como proceso hijo separado — ver explicación en run-test.js.
// El reporter dejó pdf-context.json en artifactsDir; este standalone lo lee y
// arma el PDF sin conflicto con los workers de Playwright.
try {
  spawnSync('node', ['.autoflow/scripts/generate-pdf-from-context.js', artifactsDir], {
    stdio: 'inherit',
    shell: false,
  });
} catch (errPdf) {
  console.error(`⚠ No se pudo disparar la generación del PDF: ${errPdf?.message ?? errPdf}`);
}

const resultado = {
  total: totalCasos,
  status: exitCode === 0 ? 'passed' : 'failed',
  exitCode,
  duration,
  set: set.nombre,
  slug: set.slug,
  specPath: set.specPath,
  artifactsDir,
};

// Persistir el run para el dashboard.
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
const run = {
  id: runId,
  timestamp: new Date().toISOString(),
  tipo: 'testset',
  specPath: set.specPath,
  testSetSlug: set.slug,
  testSetId: set.id,
  grep: null,
  testIds: [],
  status: resultado.status,
  exitCode,
  duration,
  total: totalCasos,
  artifactsDir,
};
const runsDir = '.autoflow/runs';
try {
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify(run, null, 2), 'utf8');
} catch (err) {
  console.error(`⚠ No se pudo persistir el run: ${err.message}`);
}

console.log('');
console.log(`AUTOFLOW_RESULT: ${JSON.stringify(resultado)}`);
process.exit(exitCode);
