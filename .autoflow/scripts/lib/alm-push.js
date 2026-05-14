// alm-push.js — Push del ResultsALM.json de una corrida a HP/Micro Focus ALM
// via ALM_Updater_v2.2.0.exe (la integración propietaria).
//
// Lifecycle (lo invocan los wrappers run-test.js y run-testset.js post-PDF):
//   1. Lee .autoflow/alm/tracking.json. Si master OFF o no hay tests elegibles
//      según tracking → skip silencioso, ni se entera el QA.
//   2. Filtra los tests del ResultsALM.json por la regla de tracking
//      (master ON + (override Test ON o (Test sin override y Set ON))).
//   3. Verifica que cada PDF declarado en `evidence` exista y matchee filename
//      con `url_doc`. Filtra los que no.
//   4. Copia ALM_Updater_v2.2.0.exe desde .autoflow/alm/integrations/ a
//      .autoflow/alm/runs/{ts}/ — el binario requiere que el JSON esté en su
//      mismo folder.
//   5. Ejecuta el .exe con cwd = .autoflow/alm/runs/{ts}/. El .exe procesa el
//      ResultsALM.json y deja un ALM_Updater_Log_*.txt en el mismo folder.
//   6. Reporta por consola si la corrida quedó OK (exit code 0 + log presente).
//      Si falla, apunta al .txt para inspección manual.
//
// **No-bloqueante**: cualquier error se loguea y se traga — no rompe la corrida.
//
// Invocación:
//   node .autoflow/scripts/lib/alm-push.js <runDir>
// donde <runDir> es el path al run folder (ej: `runs/13_05_2026_15-37-43`).

'use strict';

const { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, unlinkSync } = require('node:fs');
const { join, basename, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const EXE_NAME = 'ALM_Updater_v2.2.0.exe';
const EXE_SOURCE = resolve(REPO_ROOT, '.autoflow/alm/integrations', EXE_NAME);

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

function log(msg) { console.log(`[alm-push] ${msg}`); }
function logWarn(msg) { console.log(`[alm-push] ⚠ ${msg}`); }
function logError(msg) { console.error(`[alm-push] ✖ ${msg}`); }

/**
 * Regla de evaluación: master ON AND (override Test ON OR (Test sin override AND Set ON))
 */
function shouldPush(tracking, test, testSetSlugByTestId) {
  if (tracking.master !== 'on') return false;
  const testId = String(test.testId);
  const testOverride = tracking.tests?.[testId];
  if (testOverride === 'on') return true;
  if (testOverride === 'off') return false;
  const slug = testSetSlugByTestId?.[testId];
  if (!slug) return false;
  return tracking.testsets?.[slug] === 'on';
}

/**
 * Construye testId → testSet.slug recorriendo .autoflow/testsets/*.json.
 * Sin esto no podemos resolver el override heredado del Set.
 */
function buildTestSetMap() {
  const dir = resolve(REPO_ROOT, '.autoflow/testsets');
  if (!existsSync(dir)) return {};
  const map = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const ts = readJson(join(dir, file));
    if (!ts || !Array.isArray(ts.casos)) continue;
    for (const testId of ts.casos) {
      map[String(testId)] = ts.slug || file.replace(/\.json$/, '');
    }
  }
  return map;
}

/**
 * Verifica que el PDF declarado en `evidence` exista y matchee el filename
 * con `url_doc`. Retorna true si OK.
 */
function validatePdf(test) {
  if (!test.url_doc || !test.evidence) {
    logWarn(`Test ${test.testId}: ResultsALM.json sin url_doc/evidence — saltado.`);
    return false;
  }
  const pdfPath = resolve(REPO_ROOT, test.url_doc);
  if (!existsSync(pdfPath)) {
    logWarn(`Test ${test.testId}: PDF no existe en ${test.url_doc} — saltado.`);
    return false;
  }
  if (basename(pdfPath) !== test.evidence) {
    logWarn(`Test ${test.testId}: filename del PDF no coincide con evidence (${basename(pdfPath)} vs ${test.evidence}) — saltado.`);
    return false;
  }
  return true;
}

/**
 * Busca el log que el .exe deja después de correr: ALM_Updater_Log_*.txt
 * en el folder de la corrida. Si hay varios, devuelve el más reciente por mtime.
 */
function findLogFile(almRunDir) {
  if (!existsSync(almRunDir)) return null;
  try {
    const candidates = readdirSync(almRunDir)
      .filter((f) => /^ALM_Updater_Log_.+\.txt$/i.test(f))
      .map((f) => ({ name: f, path: join(almRunDir, f) }));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].path;
    const { statSync } = require('node:fs');
    candidates.sort((a, b) => statSync(b.path).mtimeMs - statSync(a.path).mtimeMs);
    return candidates[0].path;
  } catch {
    return null;
  }
}

function main() {
  const runDir = process.argv[2];
  if (!runDir) {
    logError('Falta argumento runDir. Uso: node alm-push.js <runDir>');
    process.exit(1);
  }

  const runTimestamp = basename(runDir);
  const almRunDir = resolve(REPO_ROOT, '.autoflow/alm/runs', runTimestamp);
  const resultsAlmPath = join(almRunDir, 'ResultsALM.json');

  // 1) ResultsALM.json tiene que existir (lo escribió el reporter onEnd).
  if (!existsSync(resultsAlmPath)) {
    log(`Sin ResultsALM.json (${resultsAlmPath}). Skipping.`);
    process.exit(0);
  }
  const resultsAlm = readJson(resultsAlmPath);
  if (!resultsAlm || !Array.isArray(resultsAlm.tests) || resultsAlm.tests.length === 0) {
    log('ResultsALM.json sin tests. Skipping.');
    process.exit(0);
  }

  // 2) Tracking — si master OFF, ni siquiera tocamos el resto.
  const trackingPath = resolve(REPO_ROOT, '.autoflow/alm/tracking.json');
  const tracking = readJson(trackingPath) || { master: 'off', tests: {}, testsets: {} };
  if (tracking.master !== 'on') {
    log('Master switch OFF — integración desactivada. Activala desde el menú → Configuración de ejecuciones en ALM.');
    process.exit(0);
  }

  // 3) Filtrar por tracking.
  const testSetMap = buildTestSetMap();
  const eligibles = resultsAlm.tests.filter((t) => shouldPush(tracking, t, testSetMap));
  if (eligibles.length === 0) {
    log('Ningún Test de esta corrida tiene tracking activo. Skipping silencioso.');
    process.exit(0);
  }

  // 4) Validar PDFs.
  const validados = eligibles.filter((t) => validatePdf(t));
  if (validados.length === 0) {
    logWarn('Tracking activo pero ningún Test tiene PDF válido. Nada para pushear.');
    process.exit(0);
  }

  // 5) Verificar que exista el .exe.
  if (!existsSync(EXE_SOURCE)) {
    logWarn(`No encontré ${EXE_NAME} en .autoflow/alm/integrations/. La integración no puede correr — pediselo al admin del repo.`);
    process.exit(0);
  }

  // 6) Co-locar exe + JSON + PDFs en el folder de la corrida.
  //    El .exe espera todo en su mismo folder (json + pdfs), así puede leer
  //    los archivos por filename pelado sin necesitar paths relativos.
  mkdirSync(almRunDir, { recursive: true });
  const exeDestPath = join(almRunDir, EXE_NAME);
  try {
    copyFileSync(EXE_SOURCE, exeDestPath);
  } catch (err) {
    logError(`No pude copiar el .exe a ${exeDestPath}: ${err.message}`);
    process.exit(1);
  }

  // Copiar cada PDF al folder y acortar `url_doc` + `evidence` al filename pelado.
  // Los 3 archivos (exe, json, pdfs) quedan al mismo nivel — `url_doc` y `evidence`
  // ahora son iguales (ej: ambos "99001.pdf").
  const pdfDestPaths = [];
  for (const test of validados) {
    const srcPdf = resolve(REPO_ROOT, test.url_doc);
    const destPdf = join(almRunDir, test.evidence);
    try {
      copyFileSync(srcPdf, destPdf);
      pdfDestPaths.push(destPdf);
    } catch (err) {
      logError(`No pude copiar el PDF de Test ${test.testId} (${srcPdf} → ${destPdf}): ${err.message}`);
      process.exit(1);
    }
    test.url_doc = test.evidence;
  }

  // Reescribir ResultsALM.json con solo los tests elegibles y los paths cortos.
  const filteredPayload = { config: resultsAlm.config, tests: validados };
  writeFileSync(resultsAlmPath, JSON.stringify(filteredPayload, null, 2), 'utf8');

  // 7) Ejecutar el .exe.
  log(`Ejecutando ${EXE_NAME} con ${validados.length} Test(s) elegibles desde ${almRunDir}`);
  const result = spawnSync(exeDestPath, [], {
    cwd: almRunDir,
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  });

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  // Mostrale al QA lo que dijo la integración (los wrappers usan stdio:'inherit',
  // así que esto va directo a la consola del QA).
  if (stdout) {
    console.log('--- ALM_Updater output ---');
    console.log(stdout);
    console.log('--------------------------');
  }
  if (stderr) {
    console.error('--- ALM_Updater stderr ---');
    console.error(stderr);
    console.error('--------------------------');
  }

  // 8) Buscar el log que dejó el .exe.
  const logFile = findLogFile(almRunDir);
  const logHint = logFile ? `Log de la integración: ${logFile}` : 'La integración no dejó log .txt (raro — revisar el stdout de arriba).';

  // 9) Cleanup: borrar el .exe y los PDFs copiados. El folder queda con
  //    solo el ResultsALM.json (final, con paths cortos) + ALM_Updater_Log_*.txt
  //    para auditoría. Idempotente — try/catch por si algo ya no está.
  for (const pdfPath of pdfDestPaths) {
    try { unlinkSync(pdfPath); } catch {}
  }
  try { unlinkSync(exeDestPath); } catch {}

  if (result.status === 0) {
    log(`✅ Push OK. ${validados.length} Test(s) reflejados en ALM.`);
    log(logHint);
    process.exit(0);
  } else {
    logError(`Push falló (exit ${result.status}).`);
    logError(logHint);
    logError('Para más detalle, abrí el log .txt o reintentá el run desde el menú.');
    process.exit(2);
  }
}

try {
  main();
} catch (err) {
  logError(`Excepción inesperada: ${err.message}`);
  process.exit(1);
}
