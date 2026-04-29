// Lanza `playwright codegen` con la URL inicial de la sesión activa.
// El agente AutoFlow es quien crea el archivo de sesión antes de disparar este script.

const { spawn } = require('node:child_process');
const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const RECORDINGS_DIR = '.autoflow/recordings';

function obtenerSesionActiva() {
  if (!existsSync(RECORDINGS_DIR)) return null;
  const archivos = readdirSync(RECORDINGS_DIR).filter((f) => f.endsWith('-session.json'));
  for (const archivo of archivos) {
    const path = join(RECORDINGS_DIR, archivo);
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      if (data.activa === true) return { path, data };
    } catch {
      // Ignorar archivos rotos.
    }
  }
  return null;
}

const sesion = obtenerSesionActiva();
if (!sesion) {
  console.error('❌ No hay ninguna sesión activa en .autoflow/recordings/.');
  console.error('   Pedile al agente AutoFlow que arranque una con "Crear caso".');
  process.exit(1);
}

const { numero, urlInicial, specPath } = sesion.data;

console.log('');
console.log(`🎬 Grabando ${numero}`);
console.log(`   URL inicial: ${urlInicial}`);
console.log(`   Output:      ${specPath}`);
console.log('');
console.log('Cuando termines, cerrá el browser y volvé al chat de Copilot.');
console.log('');

const args = [
  'playwright',
  'codegen',
  `--output=${specPath}`,
  '--target=playwright-test',
  urlInicial,
];

const proc = spawn('npx', args, { stdio: 'inherit', shell: true });
proc.on('exit', (code) => process.exit(code ?? 0));
