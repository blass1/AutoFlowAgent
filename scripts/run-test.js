// Corre un test puntual con Playwright e imprime una línea estructurada al final
// para que el agente AutoFlow pueda parsearla.
//
// Uso: node scripts/run-test.js <archivo> [--headed]

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');

const archivo = process.argv[2];
const headed = process.argv.includes('--headed');
if (!archivo) {
  console.error('Uso: node scripts/run-test.js <archivo> [--headed]');
  process.exit(1);
}

if (!existsSync(archivo)) {
  console.error(`❌ No encuentro ${archivo}.`);
  process.exit(1);
}

const args = ['playwright', 'test', archivo, '--reporter=line'];
if (headed) args.push('--headed', '--workers=1');

const inicio = Date.now();
const res = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: true,
});
const duration = Date.now() - inicio;
const exitCode = res.status ?? 1;

const resultado = {
  status: exitCode === 0 ? 'passed' : 'failed',
  duration,
  exitCode,
  archivo,
};

console.log('');
console.log(`AUTOFLOW_RESULT: ${JSON.stringify(resultado)}`);
process.exit(exitCode);
