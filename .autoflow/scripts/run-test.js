// Corre un test puntual con Playwright e imprime una línea estructurada al final
// para que el agente AutoFlow pueda parsearla.
//
// Por defecto usa --reporter=line (rápido, sin overhead de HTML/trace en cada
// corrida). Pasale --debug para sumar reporter html + trace=on (modo investigación,
// útil cuando un test falla y querés abrir el reporte HTML después).
//
// Uso: node .autoflow/scripts/run-test.js <archivo> [--headed] [--debug] [--grep <texto>]

const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, basename } = require('node:path');

const archivo = process.argv[2];
const headed = process.argv.includes('--headed');
const debug = process.argv.includes('--debug');
const grepIdx = process.argv.indexOf('--grep');
const grep = grepIdx !== -1 ? process.argv[grepIdx + 1] : null;
if (!archivo) {
  console.error('Uso: node .autoflow/scripts/run-test.js <archivo> [--headed] [--grep <texto>]');
  process.exit(1);
}

if (!existsSync(archivo)) {
  console.error(`❌ No encuentro ${archivo}.`);
  process.exit(1);
}

// `line` por default — rápido, sin overhead de HTML/trace en cada corrida.
// Con --debug sumamos reporter html + trace=on para investigar (típicamente
// el menú post-fallo del agente lo dispara con --debug para abrir el reporte).
const args = ['playwright', 'test', archivo, '--reporter=line'];
if (debug) {
  args[args.length - 1] = '--reporter=line,html';
  args.push('--trace=on');
}
if (headed) args.push('--headed', '--workers=1');
if (grep) args.push('--grep', JSON.stringify(grep));

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
  grep,
};

// Persistir el run para el dashboard. Ids extraídos del grep si tiene forma `\[testId:NNN\]`.
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
const testIds = [];
if (grep) {
  for (const m of grep.matchAll(/testId:(\d+)/g)) testIds.push(m[1]);
}
const slugMatch = basename(archivo).match(/^(.+)-(\d+)\.spec\.ts$/);
const run = {
  id: runId,
  timestamp: new Date().toISOString(),
  tipo: 'test',
  specPath: archivo,
  testSetSlug: slugMatch ? slugMatch[1] : null,
  testSetId: slugMatch ? slugMatch[2] : null,
  grep: grep ?? null,
  testIds,
  status: resultado.status,
  exitCode,
  duration,
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
