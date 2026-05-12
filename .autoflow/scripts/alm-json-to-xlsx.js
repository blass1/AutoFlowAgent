// Toma un JSON con la forma { test_id, new_steps: [...] } (emitido por
// `humanizar y exportar`, ver .autoflow/conventions/alm-steps.md) y escribe
// un .xlsx hermano en la misma carpeta. Más adelante un .exe de la integración
// leerá el JSON para subir los steps a ALM; el xlsx es la copia legible que
// el QA revisa/edita antes.
//
// Uso: node .autoflow/scripts/alm-json-to-xlsx.js <path al .json>
// Output: imprime AUTOFLOW_ALM_XLSX: { ok, path, rows } parseable por el agente.

const { readFileSync, existsSync } = require('node:fs');
const { dirname, basename, join } = require('node:path');
const XLSX = require('xlsx');

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Uso: node .autoflow/scripts/alm-json-to-xlsx.js <path al .json>');
  process.exit(1);
}
if (!existsSync(jsonPath)) {
  console.error(`❌ No encuentro ${jsonPath}.`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(readFileSync(jsonPath, 'utf8'));
} catch (err) {
  console.error(`❌ JSON inválido en ${jsonPath}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data.new_steps)) {
  console.error('❌ El JSON no tiene la forma esperada: falta `new_steps[]`. Ver .autoflow/conventions/alm-steps.md.');
  process.exit(1);
}

const filas = [
  ['Test ID', 'Step Number', 'Action', 'Name', 'Description', 'Expected'],
];
data.new_steps.forEach((s, idx) => {
  filas.push([
    data.test_id ?? '',
    idx + 1,
    s.action ?? '',
    s.name ?? '',
    s.description ?? '',
    s.expected ?? '',
  ]);
});

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(filas);
// Anchos sugeridos por columna (para que el xlsx se lea cómodo al abrirlo).
ws['!cols'] = [
  { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 28 }, { wch: 70 }, { wch: 60 },
];
XLSX.utils.book_append_sheet(wb, ws, 'Test');

const dir = dirname(jsonPath);
const base = basename(jsonPath, '.json');
const outPath = join(dir, `${base}.xlsx`);
XLSX.writeFile(wb, outPath);

console.log('');
console.log(`AUTOFLOW_ALM_XLSX: ${JSON.stringify({ ok: true, path: outPath, rows: data.new_steps.length })}`);
