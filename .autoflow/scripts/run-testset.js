// Corre todos los casos de un test set y reporta un resumen estructurado.
//
// Uso: node .autoflow/scripts/run-testset.js <slug> [--headed]

const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const slug = process.argv[2];
const headed = process.argv.includes('--headed');
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
if (!set.specPath) {
  console.error('❌ El test set no tiene specPath. Esperado: tests/{slug}-{id}.spec.ts');
  process.exit(1);
}
if (!existsSync(set.specPath)) {
  console.error(`❌ No encuentro el spec ${set.specPath}.`);
  process.exit(1);
}

const totalCasos = Array.isArray(set.casos) ? set.casos.length : 0;
console.log(`🚀 Corriendo "${set.nombre}" (${totalCasos} casos en ${set.specPath})`);
console.log('');

const inicio = Date.now();
const args = ['playwright', 'test', set.specPath, '--reporter=line'];
if (headed) args.push('--headed', '--workers=1');
const res = spawnSync('npx', args, { stdio: 'inherit', shell: true });
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

console.log('');
console.log(`AUTOFLOW_RESULT: ${JSON.stringify(resultado)}`);
process.exit(exitCode);
