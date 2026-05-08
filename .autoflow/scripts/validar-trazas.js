// Audit + reparación de trazas (`.autoflow/recordings/{numero}-path.json`).
//
// Para cada session.json con `activa: false`:
//   - Si existe el path.json correspondiente y tiene `path[]` no vacío → ok.
//   - Si falta:
//     - Si están los inputs (parsed.json + grupos.json + nodos.json) → intenta regenerar
//       llamando a generar-traza.js. Si funciona → "regenerado". Si falla → "fallido".
//     - Si faltan inputs → "irrecuperable" (la grabación se borró sin haber generado la
//       traza; hay que regrabar el caso).
//
// Output (siempre una línea final, parseable):
//   AUTOFLOW_VALIDAR_TRAZAS: { ok: [...], regenerado: [...], fallido: [...], irrecuperable: [...] }
//
// Uso:
//   node .autoflow/scripts/validar-trazas.js              → audit + intento de reparación
//   node .autoflow/scripts/validar-trazas.js --solo-audit → no intenta regenerar, solo reporta

const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const soloAudit = process.argv.includes('--solo-audit');
const RECORDINGS = '.autoflow/recordings';

if (!existsSync(RECORDINGS)) {
  console.log(`AUTOFLOW_VALIDAR_TRAZAS: ${JSON.stringify({ ok: [], regenerado: [], fallido: [], irrecuperable: [] })}`);
  process.exit(0);
}

const sessionsArchivos = readdirSync(RECORDINGS).filter((f) => /-session\.json$/.test(f));

const ok = [];
const regenerado = [];
const fallido = [];
const irrecuperable = [];

for (const archivo of sessionsArchivos) {
  const numero = archivo.replace(/-session\.json$/, '');
  const sessionPath = join(RECORDINGS, archivo);
  let session;
  try { session = JSON.parse(readFileSync(sessionPath, 'utf8')); }
  catch { continue; }
  if (session.activa !== false) continue; // no auditamos sesiones activas

  const pathJson = join(RECORDINGS, `${numero}-path.json`);
  const parsedJson = join(RECORDINGS, `${numero}-parsed.json`);
  const gruposJson = join(RECORDINGS, `${numero}-grupos.json`);

  // ¿Existe y está OK?
  if (existsSync(pathJson)) {
    try {
      const data = JSON.parse(readFileSync(pathJson, 'utf8'));
      if (Array.isArray(data.path) && data.path.length > 0) {
        ok.push({ numero, nombre: session.nombre, pasos: data.path.length });
        continue;
      }
    } catch { /* corrupto, cae al if de abajo */ }
  }

  // Falta o está roto. ¿Tenemos inputs para regenerar?
  const hayInputs = existsSync(parsedJson) && existsSync(gruposJson);
  if (!hayInputs) {
    irrecuperable.push({
      numero,
      nombre: session.nombre,
      razon: existsSync(parsedJson)
        ? 'falta grupos.json (probablemente la grabación se canceló mid-agrupación)'
        : 'falta parsed.json (los temporales se borraron sin generar la traza)',
    });
    continue;
  }

  if (soloAudit) {
    // Solo reportamos, no regeneramos.
    fallido.push({ numero, nombre: session.nombre, razon: 'sin path.json (--solo-audit, no se intentó regenerar)' });
    continue;
  }

  // Intentar regenerar.
  const res = spawnSync('node', ['.autoflow/scripts/generar-traza.js', numero], { encoding: 'utf8' });
  if (res.status === 0 && existsSync(pathJson)) {
    let pasos = 0;
    try { pasos = (JSON.parse(readFileSync(pathJson, 'utf8')).path || []).length; } catch {}
    regenerado.push({ numero, nombre: session.nombre, pasos });
  } else {
    const stderr = (res.stderr || '').trim().split('\n').slice(-3).join(' / ');
    fallido.push({ numero, nombre: session.nombre, razon: stderr || `exit code ${res.status}` });
  }
}

console.log('');
console.log(`AUTOFLOW_VALIDAR_TRAZAS: ${JSON.stringify({ ok, regenerado, fallido, irrecuperable })}`);
