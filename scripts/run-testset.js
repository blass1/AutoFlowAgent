// Corre todos los casos de un test set y reporta un resumen estructurado.
//
// Uso: node scripts/run-testset.js <slug>

const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const slug = process.argv[2];
if (!slug) {
  console.error('Uso: node scripts/run-testset.js <slug>');
  process.exit(1);
}

const setPath = join('.autoflow/testsets', `${slug}.json`);
if (!existsSync(setPath)) {
  console.error(`❌ No encuentro ${setPath}.`);
  process.exit(1);
}

const set = JSON.parse(readFileSync(setPath, 'utf8'));
if (!Array.isArray(set.casos) || set.casos.length === 0) {
  console.error('❌ El test set no tiene casos.');
  process.exit(1);
}

console.log(`🚀 Corriendo "${set.nombre}" (${set.casos.length} casos)`);
console.log('');

const inicio = Date.now();
const args = ['playwright', 'test', ...set.casos, '--reporter=line'];
const res = spawnSync('npx', args, { stdio: 'inherit', shell: true });
const duration = Date.now() - inicio;
const exitCode = res.status ?? 1;

const resultado = {
  total: set.casos.length,
  status: exitCode === 0 ? 'passed' : 'failed',
  exitCode,
  duration,
  set: set.nombre,
  slug: set.slug,
  casos: set.casos,
};

console.log('');
console.log(`AUTOFLOW_RESULT: ${JSON.stringify(resultado)}`);
process.exit(exitCode);
