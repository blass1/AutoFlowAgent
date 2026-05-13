// Helper compartido: lee un JSON tolerando dos bugs típicos de Windows:
//
//   1. BOM UTF-8 (EF BB BF) al inicio del archivo.
//      Causa: editores en Windows (Notepad, algunas tools de VS Code como
//      `create_file` cuando lo usa Copilot) escriben UTF-8 con BOM.
//      Síntoma: `JSON.parse()` tira "Unexpected token" en el primer carácter.
//
//   2. Double-encoding (mojibake "Ã³" en vez de "ó").
//      Causa: cuando `spawn('npx ...', { shell: true })` corre en Windows,
//      la code page del sistema (CP850/CP1252) se mete en el medio y los
//      bytes UTF-8 de tildes/eñes pasan por latin1 y se re-codifican como
//      UTF-8. El resultado es que `readFileSync(path, 'utf8')` te devuelve
//      la versión doblemente codificada.
//      Síntoma: `Welcome a José` queda como `Welcome a JosÃ©`. Los ids
//      derivados no matchean contra `nodos.json` que tiene los originales.
//
// Comportamiento:
//   - Si el archivo no tiene ninguno de los dos bugs → se comporta exactamente
//     igual que `JSON.parse(readFileSync(path, 'utf8'))`. Backward-compatible.
//   - Si tiene BOM → lo stripea.
//   - Si tiene mojibake → re-decodifica como latin1 (los bytes ya eran UTF-8
//     "disfrazados" de latin1) y reintenta.
//
// Uso:
//   const { leerJsonSeguro } = require('./lib/leer-json-seguro');
//   const data = leerJsonSeguro('.autoflow/nodos.json');           // throw si no existe
//   const safe = leerJsonSeguro('.autoflow/nodos.json', null);     // fallback si no existe / inválido
//
// Para escribir JSON, seguí usando `JSON.stringify` + `writeFileSync(path, str, 'utf8')` —
// Node escribe UTF-8 sin BOM por default, así que no necesitás nada especial.

const { readFileSync, existsSync } = require('node:fs');

function stripBomString(s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

// Heurística para detectar mojibake latin1-en-UTF8: secuencias de "Ã" seguidas
// del rango alto que aparecen cuando una `ó` (UTF-8: 0xC3 0xB3) se lee como
// latin1 (0xC3='Ã', 0xB3='³') y después se reinterpreta como UTF-8.
// Otros pares comunes: Ã¡ (á), Ã© (é), Ã­ (í), Ã³ (ó), Ãº (ú), Ã± (ñ), Â¿ (¿), Â¡ (¡).
const RE_MOJIBAKE = /Ã[\x80-\xBF]|Â[\x80-\xBF]/;

function leerJsonSeguro(path, fallback) {
  if (!existsSync(path)) {
    if (arguments.length >= 2) return fallback;
    throw new Error(`leerJsonSeguro: archivo no encontrado: ${path}`);
  }

  // Primer intento: UTF-8 con strip de BOM. Cubre el 99% de los casos.
  let raw = readFileSync(path, 'utf8');
  raw = stripBomString(raw);

  // Si la heurística detecta mojibake, re-leemos como latin1 y reintentamos.
  // Los bytes del archivo, cuando se leyeron originalmente como UTF-8 producían
  // los pares "Ã³" porque los bytes ya estaban en formato UTF-8 pero el writer
  // los puso pensando que eran latin1. Leerlos como latin1 nos devuelve los
  // bytes UTF-8 reales como string, listos para parsear.
  if (RE_MOJIBAKE.test(raw)) {
    const buf = readFileSync(path);
    raw = buf.toString('latin1');
    raw = stripBomString(raw);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    if (arguments.length >= 2) return fallback;
    throw new Error(`leerJsonSeguro: JSON inválido en ${path}: ${err.message}`);
  }
}

module.exports = { leerJsonSeguro };
