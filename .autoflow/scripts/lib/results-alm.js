// Daily aggregator de resultados para ALM.
//
// Por cada corrida, appendea una entry al archivo
//   .autoflow/runs/{DD_MM_YYYY}/ResultsALM.json
// (creando el directorio si no existe). Si ya hay una entry con el mismo
// testId en el mismo día, la actualiza en vez de duplicar — refleja "el
// último resultado de ese testId hoy".
//
// Shape del archivo:
//   {
//     "date": "13_05_2026",
//     "lastUpdated": "2026-05-13T14:30:15.123Z",
//     "entries": [
//       { "testId": "99001", "status": "passed", "pdfPath": "runs/13_05_2026_14-30-00/99001.pdf", "testSet": "compraSamsungGalaxyS6" },
//       ...
//     ]
//   }
//
// El consumidor previsto es la integración con ALM (a futuro un .exe que lea
// este archivo y suba los resultados). El path queda relativo a la raíz del
// repo para que sea portable.

const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { formatDateOnly } = require('./run-timestamp');
const { leerJsonSeguro } = require('./leer-json-seguro');

function appendResultsAlm(entries, date = new Date()) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const dateStr = formatDateOnly(date);
  const dailyDir = join('.autoflow/runs', dateStr);
  const filePath = join(dailyDir, 'ResultsALM.json');

  mkdirSync(dailyDir, { recursive: true });

  // Cargar archivo existente o arrancar vacío. leerJsonSeguro maneja BOM y
  // mojibake; si el archivo está corrupto, retorna null y arrancamos limpio.
  let payload = { date: dateStr, lastUpdated: date.toISOString(), entries: [] };
  const raw = leerJsonSeguro(filePath, null);
  if (raw && Array.isArray(raw.entries)) {
    payload = { ...payload, entries: raw.entries };
  }

  // Merge: por cada entry nueva, si el testId ya está, reemplazamos; sino, push.
  for (const e of entries) {
    if (!e || !e.testId) continue;
    const norm = {
      testId: String(e.testId),
      status: e.status || 'unknown',
      pdfPath: e.pdfPath || null,
      testSet: e.testSet || null,
      timestamp: e.timestamp || date.toISOString(),
    };
    const idx = payload.entries.findIndex((x) => String(x.testId) === norm.testId);
    if (idx >= 0) payload.entries[idx] = norm;
    else payload.entries.push(norm);
  }

  payload.lastUpdated = date.toISOString();
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

module.exports = { appendResultsAlm };
