// Corre todos los casos de un test set y reporta un resumen estructurado.
//
// Por defecto usa --reporter=line (rápido, sin overhead de HTML/trace en cada
// corrida). Pasale --debug para sumar reporter html + trace=on.
//
// Uso: node .autoflow/scripts/run-testset.js <slug> [--headed] [--headless] [--debug]

const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

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

const inicio = Date.now();
// Reporter `line` por default (rápido). `--debug` suma html + trace=on cuando el
// agente quiere investigar después de un fallo.
const args = ['playwright', 'test', set.specPath, '--reporter=line'];
if (debug) {
  args[args.length - 1] = '--reporter=line,html';
  args.push('--trace=on');
}
if (headed) args.push('--headed', '--workers=1');
// AUTOFLOW_RUN_PERSISTED desactiva el reporter custom de Playwright (lib/run-reporter.js)
// para evitar runs duplicados — este wrapper persiste su propia entrada con más contexto.
const res = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, AUTOFLOW_RUN_PERSISTED: '1' },
});
const duration = Date.now() - inicio;
const exitCode = res.status ?? 1;

const resultado = {
  total: totalCasos,
  status: exitCode === 0 ? 'passed' : 'failed',
  exitCode,
  duration,
  set: set.nombre,
  slug: set.slug,
  specPath: set.specPath,
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
