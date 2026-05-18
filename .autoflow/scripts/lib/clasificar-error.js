// Clasifica un fallo de Test contra el catálogo de patterns para emitir un
// "motivo" legible en el reporte. Lee:
//   - .autoflow/conventions/error-patterns.json (catálogo)
//   - {runDir}/failures/{testId}.json (evidencia capturada por la fixture errorCapture)
//
// Devuelve `{ id, label }` con el primer pattern que matchea, o `null` si ninguno aplica.
// El llamador (run-test.js / run-testset.js) decide cómo mostrarlo.

const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const PATTERNS_PATH = '.autoflow/conventions/error-patterns.json';

function cargarPatterns() {
  if (!existsSync(PATTERNS_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(PATTERNS_PATH, 'utf8'));
    return Array.isArray(raw.patterns) ? raw.patterns : [];
  } catch {
    return [];
  }
}

function leerFailure(runDir, testId) {
  if (!runDir || !testId) return null;
  const path = join(runDir, 'failures', `${testId}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Evalúa un único matcher (`pattern.if[matcherKey]`) contra el failure.
// Devuelve `{ ok: boolean, context: object }`. `context` lleva datos para extract
// (request matcheado, selector visto, etc.).
function evaluarMatcher(matcherKey, matcherValue, failure) {
  switch (matcherKey) {
    case 'domText': {
      const re = new RegExp(matcherValue, 'i');
      return { ok: re.test(failure.domSnapshot || ''), context: {} };
    }
    case 'selectorVisible': {
      const list = Array.isArray(matcherValue) ? matcherValue : [matcherValue];
      const hit = list.find((sel) => (failure.visibleErrorSelectors || []).includes(sel));
      return { ok: Boolean(hit), context: { selector: hit } };
    }
    case 'networkStatus': {
      const [min, max] = matcherValue;
      const req = (failure.failedRequests || []).find((r) => r.status >= min && r.status <= max);
      return { ok: Boolean(req), context: req ? { request: req } : {} };
    }
    case 'errorMessage': {
      const re = new RegExp(matcherValue, 'i');
      const text = `${failure.error?.message || ''}\n${failure.error?.stack || ''}`;
      return { ok: re.test(text), context: {} };
    }
    case 'consoleError': {
      const re = new RegExp(matcherValue, 'i');
      const hit = (failure.consoleErrors || []).find((line) => re.test(line));
      return { ok: Boolean(hit), context: { consoleLine: hit } };
    }
    default:
      return { ok: false, context: {} };
  }
}

// Extrae el nombre de microservicio de una URL: primer segmento de path después
// de `/api/`. Cubre patrones típicos `https://host/api/orders/...`,
// `/api/v1/orders/...`. Si no matchea, devuelve el hostname como fallback.
function extraerService(url) {
  if (!url) return 'desconocido';
  const m = url.match(/\/api\/(?:v\d+\/)?([^/?#]+)/i);
  if (m) return m[1];
  try {
    return new URL(url).hostname;
  } catch {
    return 'desconocido';
  }
}

// Sustituye placeholders {service}, {status}, {url} en `label` usando el context
// del matcher que ganó. Si el placeholder no tiene dato disponible, lo deja como
// "—".
function expandirLabel(label, context) {
  if (!label) return label;
  const req = context.request || null;
  const reemplazos = {
    service: req ? extraerService(req.url) : '—',
    status: req ? String(req.status) : '—',
    url: req ? req.url : '—',
    selector: context.selector || '—',
  };
  return label.replace(/\{(\w+)\}/g, (_, key) => reemplazos[key] ?? `{${key}}`);
}

/**
 * Clasifica un fallo. Args:
 *   - `runDir`: carpeta de artifacts del run (la del wrapper).
 *   - `testId`: id del test fallido. Resuelve `{runDir}/failures/{testId}.json`.
 * Devuelve `{ id, label }` con el primer pattern que matchea, `null` si ninguno aplica,
 * o `{ id: 'sin-evidencia', label: 'Sin evidencia (fixture errorCapture no escribió failure.json)' }`
 * cuando el failure.json no existe (el test falló antes de cargar la fixture, o el wrapper
 * apuntó al testId equivocado).
 */
function clasificarError({ runDir, testId }) {
  const failure = leerFailure(runDir, testId);
  if (!failure) {
    return { id: 'sin-evidencia', label: 'Sin evidencia para clasificar (ver trace)' };
  }
  const patterns = cargarPatterns();
  for (const pattern of patterns) {
    if (!pattern.if) continue;
    const matcherKeys = Object.keys(pattern.if);
    // Todas las condiciones del `if` deben matchear (AND).
    const evaluaciones = matcherKeys.map((k) => evaluarMatcher(k, pattern.if[k], failure));
    if (evaluaciones.every((e) => e.ok)) {
      // Merge de contextos — gana el último (suele ser el más específico).
      const context = evaluaciones.reduce((acc, e) => ({ ...acc, ...e.context }), {});
      return {
        id: pattern.id,
        label: expandirLabel(pattern.label, context),
      };
    }
  }
  return { id: 'no-clasificado', label: 'No clasificado (ver trace)' };
}

module.exports = { clasificarError };
