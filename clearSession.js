// Resetea el proyecto al estado anterior a cualquier sesión de AutoFlow:
// borra la identidad del QA, todas las grabaciones, y todo lo que el agente
// haya generado (pages, tests, fingerprints, testsets, nodos, grafos, data).
// Conserva scripts, prompts, conventions, fixtures y configuración del proyecto.
//
// Uso:
//   node clearSession.js          (pide confirmación interactiva)
//   node clearSession.js --yes    (sin confirmación, para CI/scripting)

const { readdirSync, rmSync, existsSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const readline = require('node:readline');

const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

// Archivos individuales a borrar.
const archivos = [
  '.autoflow/user.json',
  '.autoflow/nodos.json',
  '.autoflow/grafo.md',           // legado (versión anterior, antes de mover a grafos/)
  '.autoflow/grafo-nodos.md',     // legado
];

// Carpetas a vaciar (se borra todo su contenido, la carpeta queda).
const carpetasAVaciar = [
  '.autoflow/recordings',
  '.autoflow/fingerprints',
  '.autoflow/testsets',
  '.autoflow/grafos',
  'pages',
  'tests',
];

// `data/` recibe trato especial: se borra todo menos los seeds del proyecto
// (`index.ts`, `types.ts`, `usuarios.ts`, `urls.ts`, `parsers.ts`), que se resetean a su estado inicial.
const dataDir = 'data';
const dataSeeds = new Set(['index.ts', 'types.ts', 'usuarios.ts', 'urls.ts', 'parsers.ts']);

// Contenido inicial de los seeds de `data/`.
const SEED_INDEX = `export * from './types';
export * from './usuarios';
export * from './urls';
export * from './parsers';

// Cada test set agrega su propio archivo \`data-{slug}.ts\` y suma una línea acá:
//   export * from './data-{slug}';
`;

const SEED_USUARIOS = `import type { User } from './types';

/**
 * Catálogo de usuarios de prueba (homologación).
 * El agente AutoFlow agrega entradas acá durante "Crear caso".
 */
export const usuarios = {} as const satisfies Record<string, User>;
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
    if (existsSync(join(dataDir, 'usuarios.ts'))) {
      writeFileSync(join(dataDir, 'usuarios.ts'), SEED_USUARIOS, 'utf8');
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

  console.log(`Se van a borrar ${objetivos.length} archivos:`);
  for (const o of objetivos) console.log(`  • ${o}`);
  console.log('');
  console.log('Y data/index.ts se resetea a "export {};".');
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
