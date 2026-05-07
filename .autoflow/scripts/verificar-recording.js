// Verifica que el archivo .spec.ts del recording exista y tenga contenido.
// Usado por crear-caso.md paso 6 después de que el QA confirma que terminó de
// grabar, para evitar falsos negativos por race conditions de filesystem en Windows.
//
// Uso:
//   node .autoflow/scripts/verificar-recording.js <numero>
//
// Output (siempre una sola línea, parseable):
//   AUTOFLOW_RECORDING: { "ok": true|false, "path": "...", "tamaño": <N>, "razon"?: "...", "listado": [...] }

const { existsSync, statSync, readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const numero = process.argv[2];
if (!numero) {
  console.error('Uso: node .autoflow/scripts/verificar-recording.js <numero>');
  process.exit(1);
}

const RECORDINGS = '.autoflow/recordings';

// Listamos siempre el directorio para devolverlo en la respuesta.
const listado = existsSync(RECORDINGS)
  ? readdirSync(RECORDINGS).filter((f) => f !== '.gitkeep')
  : [];

// Path declarado por la sesión (si existe) — lo leemos en lugar de componerlo a mano,
// así no asumimos convenciones que puedan diverger.
const sessionPath = join(RECORDINGS, `${numero}-session.json`);
let specPathDeclarado = null;
if (existsSync(sessionPath)) {
  try {
    const sess = JSON.parse(readFileSync(sessionPath, 'utf8'));
    specPathDeclarado = sess.specPath ?? null;
  } catch {
    /* session corrupta — seguimos con el fallback de abajo */
  }
}

// Fallback al path por convención si la sesión no lo declaró.
const specPath = specPathDeclarado || join(RECORDINGS, `${numero}.spec.ts`);

const resultado = { ok: false, path: specPath, tamaño: 0, listado };

if (!existsSync(specPath)) {
  resultado.razon = 'no-existe';
} else {
  const st = statSync(specPath);
  resultado.tamaño = st.size;
  if (st.size === 0) {
    resultado.razon = 'vacio';
  } else {
    resultado.ok = true;
  }
}

console.log(`AUTOFLOW_RECORDING: ${JSON.stringify(resultado)}`);
process.exit(resultado.ok ? 0 : 1);
