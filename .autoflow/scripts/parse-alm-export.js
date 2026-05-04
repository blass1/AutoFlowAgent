// Lee un xlsx exportado de ALM y devuelve por stdout un JSON con
// { testId, nombre, enfoque } extraidos de la fila 2.
//
// Layout esperado (fila 1 son titulos):
//   A2 = Test ID
//   C2 = Nombre del caso (se limpia)
//   G2 = Enfoque de Prueba
//   E/F = Description / Expected Results de pasos (ignorados por ahora)
//
// Uso: node .autoflow/scripts/parse-alm-export.js <ruta-xlsx>
// Salida en stdout (JSON):
//   { ok: true, testId, nombre, enfoque }
//   { ok: false, error: "<mensaje>" }

const { existsSync } = require('node:fs');
const path = require('node:path');

const ALM_DIR = path.resolve('.autoflow/alm-exports');

const rutaArg = process.argv[2];
if (!rutaArg) {
  console.log(JSON.stringify({ ok: false, error: 'Falta la ruta o nombre del xlsx.' }));
  process.exit(0);
}

// Resolucion:
//  1. Si es ruta absoluta o relativa que existe tal cual, usarla.
//  2. Si no, buscar el archivo dentro de .autoflow/alm-exports/ (con o sin extension).
function resolverRuta(arg) {
  const directa = path.resolve(arg);
  if (existsSync(directa)) return directa;

  const enCarpeta = path.join(ALM_DIR, arg);
  if (existsSync(enCarpeta)) return enCarpeta;

  if (!/\.xlsx$/i.test(arg)) {
    const conExt = path.join(ALM_DIR, `${arg}.xlsx`);
    if (existsSync(conExt)) return conExt;
  }
  return null;
}

const ruta = resolverRuta(rutaArg);
if (!ruta) {
  console.log(JSON.stringify({
    ok: false,
    error: `No encontre el archivo "${rutaArg}". Poné el xlsx en .autoflow/alm-exports/ o pasá la ruta completa.`,
  }));
  process.exit(0);
}

let xlsx;
try {
  xlsx = require('xlsx');
} catch {
  console.log(JSON.stringify({ ok: false, error: 'Falta dependencia xlsx. Corré: npm install' }));
  process.exit(0);
}

// Limpia el nombre exportado de ALM:
//  - trim + colapsa espacios
//  - saca prefijos ruidosos comunes: "TC -", "TC:", "[OK]", "[NEW]", numeros sueltos al inicio
//  - saca el propio testId si aparece embebido
//  - pasa a Sentence case (primera letra en mayuscula, resto en minuscula salvo siglas cortas)
function limpiarNombre(crudo, testId) {
  if (!crudo) return '';
  let s = String(crudo).replace(/\s+/g, ' ').trim();

  if (testId) {
    const tid = String(testId).trim();
    if (tid) {
      const re = new RegExp(`\\b${tid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[\\s:_-]*`, 'gi');
      s = s.replace(re, '').trim();
    }
  }

  const prefijos = [
    /^\[\s*[a-z0-9_-]+\s*\]\s*[:\-]?\s*/i, // [OK] [NEW] [v2]
    /^TC\s*[:\-]\s*/i,                      // TC - / TC:
    /^CP\s*[:\-]\s*/i,                      // CP -
    /^\d+\s*[:\-)\.]\s*/,                   // 123) / 123:
  ];
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const re of prefijos) {
      const nuevo = s.replace(re, '').trim();
      if (nuevo !== s) { s = nuevo; cambio = true; }
    }
  }

  s = s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (s.length > 1 && s === s.toUpperCase()) {
    s = s.toLowerCase();
  }
  if (s.length > 0) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

let workbook;
try {
  workbook = xlsx.readFile(ruta);
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: `No pude leer el xlsx: ${e.message}` }));
  process.exit(0);
}

const sheetName = workbook.SheetNames[0];
if (!sheetName) {
  console.log(JSON.stringify({ ok: false, error: 'El xlsx no tiene hojas.' }));
  process.exit(0);
}
const sheet = workbook.Sheets[sheetName];

function celda(addr) {
  const c = sheet[addr];
  if (!c) return '';
  const v = c.w ?? c.v ?? '';
  return String(v).trim();
}

const testId = celda('A2');
const nombreCrudo = celda('C2');
const enfoque = celda('G2');

if (!testId) {
  console.log(JSON.stringify({ ok: false, error: 'A2 vacio: no encontre Test ID.' }));
  process.exit(0);
}
if (!nombreCrudo) {
  console.log(JSON.stringify({ ok: false, error: 'C2 vacio: no encontre nombre del caso.' }));
  process.exit(0);
}

const nombre = limpiarNombre(nombreCrudo, testId);

console.log(JSON.stringify({ ok: true, testId, nombre, enfoque }));
