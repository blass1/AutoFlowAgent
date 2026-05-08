// Genera la traza (`.autoflow/recordings/{numero}-path.json`) de un recording
// a partir de su parsed.json, los grupos persistidos por el agente y nodos.json.
//
// Uso: node .autoflow/scripts/generar-traza.js <numero>
//
// Inputs:
//   .autoflow/recordings/{numero}-parsed.json
//   .autoflow/recordings/{numero}-grupos.json   (rangos de page por nodo)
//   .autoflow/nodos.json
//
// Output:
//   .autoflow/recordings/{numero}-path.json
//
// Aborta con exit !=0 si:
//   - Falta cualquiera de los inputs.
//   - Algún nodo del recording no cae dentro de ningún rango de grupos.json.
//   - El id resultante no existe en nodos.json (catch-all de drift).

const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const numero = process.argv[2];
if (!numero) {
  console.error('Uso: node .autoflow/scripts/generar-traza.js <numero>');
  process.exit(1);
}

const parsedPath = join('.autoflow/recordings', `${numero}-parsed.json`);
const gruposPath = join('.autoflow/recordings', `${numero}-grupos.json`);
const nodosPath = '.autoflow/nodos.json';
const outPath = join('.autoflow/recordings', `${numero}-path.json`);

for (const [label, p] of [
  ['parsed', parsedPath],
  ['grupos', gruposPath],
  ['nodos', nodosPath],
]) {
  if (!existsSync(p)) {
    console.error(`❌ Falta ${label}: ${p}`);
    process.exit(1);
  }
}

const parsed = JSON.parse(readFileSync(parsedPath, 'utf8'));
const grupos = JSON.parse(readFileSync(gruposPath, 'utf8'));
const nodos = JSON.parse(readFileSync(nodosPath, 'utf8'));

if (!Array.isArray(grupos.rangos) || grupos.rangos.length === 0) {
  console.error(`❌ ${gruposPath} no tiene "rangos" o está vacío.`);
  process.exit(1);
}

function pageDelIndice(indice) {
  for (const r of grupos.rangos) {
    if (indice >= r.desde && indice <= r.hasta) return r.page;
  }
  return null;
}

const path = [];
const errores = [];

for (const nodo of parsed.nodos) {
  const page = pageDelIndice(nodo.indice);
  if (!page) {
    errores.push(`paso ${nodo.indice} (${nodo.accion} ${nodo.selector}) no cae en ningún rango de grupos.json`);
    continue;
  }
  const id = `${page}::${nodo.accion}::${nodo.selector}`;
  if (!nodos[id]) {
    errores.push(`paso ${nodo.indice} → id "${id}" no existe en nodos.json`);
    continue;
  }
  // Resolución de deprecated → reemplazadoPor: si la grabación captura un selector
  // viejo cuyo nodo ya fue reemplazado por uno más confiable (Auto-Health Node /
  // actualizar-nodos), la traza apunta al id live. Esto mantiene coherencia con
  // el código del PO que usa el selectorRaw del nodo live.
  let idFinal = id;
  if (nodos[id].deprecated && nodos[id].reemplazadoPor) {
    idFinal = nodos[id].reemplazadoPor;
    if (!nodos[idFinal]) {
      errores.push(`paso ${nodo.indice} → id "${id}" deprecated apunta a "${idFinal}" que no existe en nodos.json`);
      continue;
    }
  }
  path.push(idFinal);
}

if (errores.length > 0) {
  console.error('❌ Errores generando la traza:');
  for (const e of errores) console.error(`   - ${e}`);
  process.exit(1);
}

const resultado = {
  numero: parsed.metadata.numero,
  fechaFin: parsed.metadata.fechaFin ?? new Date().toISOString(),
  path,
};

writeFileSync(outPath, JSON.stringify(resultado, null, 2), 'utf8');
console.log(`✅ Traza escrita: ${outPath} (${path.length} nodos)`);
