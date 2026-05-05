// Lanza `playwright codegen` con --save-storage para grabar un login reusable.
// El QA loguea una vez en homologacion y el storageState (cookies + localStorage)
// queda guardado para que los siguientes casos arranquen ya logueados.
//
// El agente AutoFlow es quien decide los argumentos antes de invocar este script.
//
// Uso:
//   node .autoflow/scripts/record-auth.js <canal-slug> <userKey> <urlInicial>
//
// Output: .autoflow/auth/{canal-slug}-{userKey}.json
// Salida en stdout (linea AUTOFLOW_AUTH:):
//   { ok: true, path: ".autoflow/auth/...", canal, userKey }
//   { ok: false, error: "<mensaje>" }

const { spawn } = require('node:child_process');
const { mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const [, , canalSlug, userKey, urlInicial] = process.argv;

if (!canalSlug || !userKey || !urlInicial) {
  console.log(`AUTOFLOW_AUTH: ${JSON.stringify({ ok: false, error: 'Argumentos: <canal-slug> <userKey> <urlInicial>' })}`);
  process.exit(1);
}

const slug = canalSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const userKeyClean = userKey.replace(/[^a-zA-Z0-9_]+/g, '');

if (!slug || !userKeyClean) {
  console.log(`AUTOFLOW_AUTH: ${JSON.stringify({ ok: false, error: 'canal-slug o userKey invalidos despues de sanitizar.' })}`);
  process.exit(1);
}

const authDir = '.autoflow/auth';
mkdirSync(authDir, { recursive: true });

const outPath = join(authDir, `${slug}-${userKeyClean}.json`);
const yaExistia = existsSync(outPath);

console.log('');
console.log(`🔐 Grabando login reusable`);
console.log(`   Canal:   ${canalSlug}`);
console.log(`   Usuario: ${userKey}`);
console.log(`   Output:  ${outPath}${yaExistia ? ' (sobreescribe)' : ''}`);
console.log('');
console.log('Loguéate en la web y, cuando estés del otro lado del login, cerrá el browser.');
console.log('No hace falta que sigas navegando — solo el estado post-login.');
console.log('');

const args = [
  'playwright',
  'codegen',
  `--save-storage=${outPath}`,
  '--target=playwright-test',
  urlInicial,
];

const proc = spawn('npx', args, { stdio: 'inherit', shell: true });
proc.on('exit', (code) => {
  if (code === 0 && existsSync(outPath)) {
    console.log('');
    console.log(`AUTOFLOW_AUTH: ${JSON.stringify({ ok: true, path: outPath, canal: canalSlug, userKey })}`);
    process.exit(0);
  } else {
    console.log('');
    console.log(`AUTOFLOW_AUTH: ${JSON.stringify({ ok: false, error: `codegen termino con codigo ${code} y/o no genero ${outPath}` })}`);
    process.exit(code ?? 1);
  }
});
