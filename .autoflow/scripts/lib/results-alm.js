// ResultsALM.json — un archivo POR CORRIDA con el shape que consume la
// integración con ALM (a futuro un .exe que levante el archivo y suba los
// resultados a HP/Micro Focus ALM).
//
// Ubicación: `.autoflow/alm/runs/{run_timestamp}/ResultsALM.json` (no daily
// aggregator — un archivo por corrida, mismo timestamp que la carpeta de
// artifacts en `runs/{run_timestamp}/`).
//
// Shape del archivo (espejo exacto del formato que pide ALM):
//   {
//     "config": {
//       "legajo": "L1000846",
//       "tool": "Playwright"
//     },
//     "tests": [
//       {
//         "testId": "99001",
//         "testSetId": "99001",
//         "result": "Passed",                          // "Passed" o "Failed", capitalizado
//         "name": "Compra Samsung Galaxy S6",
//         "duration": 6,                               // segundos (entero)
//         "url_doc": "runs/13_05_2026_15-37-43/99001.pdf",  // path relativo al repo, donde está físicamente el PDF
//         "evidence": "99001.pdf"                      // solo el filename
//       }
//     ]
//   }
//
// Notas:
// - `config.legajo` viene de `.autoflow/user.json`. Si no está seteado queda como `"unknown"`.
// - `config.tool` es constante `"Playwright"` por ahora; cuando entren otros runners se parametriza.
// - `result` se capitaliza ("Passed"/"Failed") porque ese es el formato que ALM consume — distinto
//   del `status` lowercase que usan el dashboard, run JSON y resto de scripts del agente.
// - `duration` va en SEGUNDOS (no ms) y redondeado al entero — coincide con cómo ALM lo muestra.
// - `url_doc` siempre apunta físicamente al PDF en `runs/{run_timestamp}/`, relativo a la raíz del repo.
//   La integración con ALM resuelve el archivo desde ahí para subirlo como adjunto del caso.

const { mkdirSync, writeFileSync } = require('node:fs');
const { join, basename } = require('node:path');

/**
 * Escribe el ResultsALM.json de UNA corrida.
 *
 * @param {object} opts
 * @param {string} opts.runTimestamp  - Timestamp de la corrida (formato `DD_MM_YYYY_HH-MM-SS`).
 *                                       Usado para el folder destino dentro de `.autoflow/alm/runs/`.
 * @param {string} opts.runDir        - Path al run folder físico (ej: `runs/13_05_2026_15-37-43`).
 *                                       Se usa para armar `url_doc`.
 * @param {object} opts.executor      - Objeto del user.json (al menos `legajo`).
 * @param {string} opts.tool          - Herramienta de automatización (ej: `'Playwright'`).
 * @param {string} opts.pdfPath       - Path completo al PDF generado (ej: `runs/.../99001.pdf`).
 *                                       Si no hay PDF (gen falló o no aplica), pasá `null`.
 * @param {Array}  opts.tests         - Array de tests del run: `{ testId, testSetId, name, status, duration }`
 *                                       donde `status` es `'passed'|'failed'|...` y `duration` está en ms.
 *
 * @returns {string|null} - Path absoluto al archivo escrito, o null si no había tests.
 */
function writeRunResultsAlm(opts) {
  const { runTimestamp, runDir, executor, tool, pdfPath, tests } = opts;
  if (!runTimestamp || !Array.isArray(tests) || tests.length === 0) return null;

  const outDir = join('.autoflow/alm/runs', runTimestamp);
  const outPath = join(outDir, 'ResultsALM.json');
  mkdirSync(outDir, { recursive: true });

  // url_doc: relativo al repo, apuntando físicamente al PDF en runs/{ts}/.
  // evidence: solo el filename (sin path).
  const pdfFilename = pdfPath ? basename(pdfPath) : null;
  const urlDoc = pdfPath
    ? (runDir ? `${runDir.replace(/\\/g, '/')}/${pdfFilename}` : pdfFilename)
    : null;

  const payload = {
    config: {
      legajo: executor?.legajo || 'unknown',
      tool: tool || 'Playwright',
    },
    tests: tests.map((t) => ({
      testId: String(t.testId ?? ''),
      testSetId: String(t.testSetId ?? ''),
      result: t.status === 'passed' ? 'Passed' : 'Failed',
      name: t.name || '',
      duration: Math.round((t.duration || 0) / 1000),
      url_doc: urlDoc,
      evidence: pdfFilename,
    })),
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  return outPath;
}

module.exports = { writeRunResultsAlm };
