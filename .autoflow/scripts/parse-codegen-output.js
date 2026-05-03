// Parsea el .spec.ts generado por `playwright codegen` y produce un JSON estructurado
// con la lista de nodos crudos (sin page asignada todavía) y URLs visitadas.
//
// Cada nodo tiene: indice, accion, selector (normalizado), selectorRaw, valor?,
// matcher? (solo asserts), confiabilidad (1-5 o null), etiqueta?.
// La page y el id (`{page}::{accion}::{selector}`) se asignan en la etapa de
// agrupación interactiva (generar-pom.md).
//
// Uso: node .autoflow/scripts/parse-codegen-output.js <numero>

const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const numero = process.argv[2];
if (!numero) {
  console.error('Uso: node .autoflow/scripts/parse-codegen-output.js <numero>');
  process.exit(1);
}

const specPath = join('.autoflow/recordings', `${numero}.spec.ts`);
const sessionPath = join('.autoflow/recordings', `${numero}-session.json`);
const outPath = join('.autoflow/recordings', `${numero}-parsed.json`);

if (!existsSync(specPath)) {
  console.error(`❌ No encuentro ${specPath}.`);
  process.exit(1);
}
if (!existsSync(sessionPath)) {
  console.error(`❌ No encuentro ${sessionPath}.`);
  process.exit(1);
}

const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
const spec = readFileSync(specPath, 'utf8');

// Parte un chain de Playwright (`a().b().c()`) en sus segmentos top-level,
// respetando paréntesis y comillas. Ej:
//   `locator('frame[name="x"]').contentFrame().getByRole('link', { name: 'Y' })`
//   → ["locator('frame[name=\"x\"]')", "contentFrame()", "getByRole('link', { name: 'Y' })"]
function partirChain(raw) {
  const segmentos = [];
  let depth = 0;
  let inSimple = false;
  let inDoble = false;
  let inicio = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const prev = i > 0 ? raw[i - 1] : '';
    if (inSimple) {
      if (c === "'" && prev !== '\\') inSimple = false;
      continue;
    }
    if (inDoble) {
      if (c === '"' && prev !== '\\') inDoble = false;
      continue;
    }
    if (c === "'") { inSimple = true; continue; }
    if (c === '"') { inDoble = true; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '.' && depth === 0) {
      segmentos.push(raw.slice(inicio, i));
      inicio = i + 1;
    }
  }
  segmentos.push(raw.slice(inicio));
  return segmentos.map((s) => s.trim()).filter((s) => s.length > 0);
}

// Normaliza un solo segmento (sin chain). Devuelve token o null si no se reconoce.
function normalizarSegmento(seg) {
  let m;
  if ((m = seg.match(/^getByRole\(['"](\w+)['"]\s*,\s*\{\s*name:\s*['"](.+?)['"]/))) {
    return `getByRole:${m[1]}:${m[2]}`;
  }
  if ((m = seg.match(/^getByRole\(['"](\w+)['"]\)/))) {
    return `getByRole:${m[1]}`;
  }
  if ((m = seg.match(/^getByLabel\(['"](.+?)['"]\)/))) {
    return `getByLabel:${m[1]}`;
  }
  if ((m = seg.match(/^getByPlaceholder\(['"](.+?)['"]\)/))) {
    return `getByPlaceholder:${m[1]}`;
  }
  if ((m = seg.match(/^getByTestId\(['"](.+?)['"]\)/))) {
    return `getByTestId:${m[1]}`;
  }
  if ((m = seg.match(/^getByText\(['"](.+?)['"]\)/))) {
    return `getByText:${m[1]}`;
  }
  if ((m = seg.match(/^locator\(['"](.+?)['"]\)/))) {
    return `locator:${m[1]}`;
  }
  if (/^contentFrame\(\s*\)$/.test(seg)) {
    return '__contentFrame__';
  }
  return null;
}

// Normaliza el chain completo, uniendo los segmentos con `>>`. `contentFrame()`
// colapsa el `locator('frame[name="X"]')` o `locator('iframe[name="X"]')`
// previo en `iframe:X` para representar el contenedor sin perder la hoja.
function normalizarSelector(raw) {
  const segmentos = partirChain(raw);
  const tokens = [];
  for (const seg of segmentos) {
    const tok = normalizarSegmento(seg);
    if (tok === null) continue;
    if (tok === '__contentFrame__') {
      const prev = tokens[tokens.length - 1];
      if (prev) {
        const fm = prev.match(/^locator:(?:i?frame)\[name="(.+?)"\]$/);
        if (fm) {
          tokens[tokens.length - 1] = `iframe:${fm[1]}`;
          continue;
        }
      }
      tokens.push('iframe');
      continue;
    }
    tokens.push(tok);
  }
  return tokens.length > 0 ? tokens.join('>>') : raw;
}

// Confiabilidad según el segmento HOJA del chain (lo último que apunta al
// elemento real). Los segmentos `contentFrame()` y los iframe-container no
// cuentan: lo que importa es la calidad del locator final.
// 5 = testid, 4 = role+name, 3 = label, 2 = placeholder/text, 1 = css/posicional.
function calcularConfiabilidad(raw) {
  const segmentos = partirChain(raw);
  let hoja = null;
  for (const seg of segmentos) {
    if (/^contentFrame\(\s*\)$/.test(seg)) continue;
    if (/^getBy\w+\(/.test(seg) || /^locator\(/.test(seg)) hoja = seg;
  }
  if (!hoja) return null;
  if (hoja.startsWith('getByTestId(')) return 5;
  if (hoja.startsWith('getByRole(')) return 4;
  if (hoja.startsWith('getByLabel(')) return 3;
  if (hoja.startsWith('getByPlaceholder(') || hoja.startsWith('getByText(')) return 2;
  if (hoja.startsWith('locator(')) return 1;
  return null;
}

function extraerEtiqueta(selectorNormalizado) {
  const partes = selectorNormalizado.split(':');
  return partes.length > 1 ? partes[partes.length - 1] : null;
}

// URL relativa a partir de una absoluta. Si ya es relativa, la deja igual.
function relativizarUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
}

const nodos = [];
const urlsVisitadas = [];
let indice = 0;

// Greedy: captura el chain entero. El sufijo de la acción (.click(), .fill(...))
// delimita por la derecha. Tiene que arrancar con getBy*( o locator(.
const SEL = '((?:getBy\\w+\\(|locator\\().+)';

const lineas = spec.split('\n');
for (const linea of lineas) {
  const limpia = linea.trim();

  // await expect(page.<SEL>).<matcher>(<arg opcional>)
  let mAssert = limpia.match(
    new RegExp(`^await expect\\(page\\.${SEL}\\)\\.(\\w+)\\((['"\`](.*?)['"\`])?\\)`),
  );
  if (mAssert) {
    indice++;
    const selectorRaw = mAssert[1];
    const selector = normalizarSelector(selectorRaw);
    nodos.push({
      indice,
      accion: 'assert',
      matcher: mAssert[2],
      selector,
      selectorRaw,
      valor: mAssert[4] ?? null,
      etiqueta: extraerEtiqueta(selector),
      confiabilidad: null,
      raw: limpia,
    });
    continue;
  }

  // await expect(page).<matcher>(<arg>)
  mAssert = limpia.match(/^await expect\(page\)\.(\w+)\(['"`](.+?)['"`]\)/);
  if (mAssert) {
    indice++;
    nodos.push({
      indice,
      accion: 'assert',
      matcher: mAssert[1],
      selector: 'page',
      selectorRaw: 'page',
      valor: mAssert[2],
      confiabilidad: null,
      raw: limpia,
    });
    continue;
  }

  if (!limpia.startsWith('await page.')) continue;

  // page.goto('https://...')
  let m = limpia.match(/^await page\.goto\(['"](.+?)['"]\)/);
  if (m) {
    indice++;
    const urlRel = relativizarUrl(m[1]);
    nodos.push({
      indice,
      accion: 'goto',
      selector: `goto:${urlRel}`,
      selectorRaw: `goto('${m[1]}')`,
      valor: m[1],
      confiabilidad: null,
      raw: limpia,
    });
    urlsVisitadas.push(m[1]);
    continue;
  }

  // page.<SEL>.click()
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.click\\(\\)`));
  if (m) {
    indice++;
    const selectorRaw = m[1];
    const selector = normalizarSelector(selectorRaw);
    nodos.push({
      indice,
      accion: 'click',
      selector,
      selectorRaw,
      etiqueta: extraerEtiqueta(selector),
      confiabilidad: calcularConfiabilidad(selectorRaw),
      raw: limpia,
    });
    continue;
  }

  // page.<SEL>.fill('valor')
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.fill\\(['"](.*?)['"]\\)`));
  if (m) {
    indice++;
    const selectorRaw = m[1];
    const selector = normalizarSelector(selectorRaw);
    nodos.push({
      indice,
      accion: 'fill',
      selector,
      selectorRaw,
      valor: m[2],
      etiqueta: extraerEtiqueta(selector),
      confiabilidad: calcularConfiabilidad(selectorRaw),
      raw: limpia,
    });
    continue;
  }

  // page.<SEL>.press('Key')
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.press\\(['"](.+?)['"]\\)`));
  if (m) {
    indice++;
    const selectorRaw = m[1];
    const selector = normalizarSelector(selectorRaw);
    nodos.push({
      indice,
      accion: 'press',
      selector,
      selectorRaw,
      valor: m[2],
      confiabilidad: calcularConfiabilidad(selectorRaw),
      raw: limpia,
    });
    continue;
  }

  // page.<SEL>.check() / .uncheck()
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.(check|uncheck)\\(\\)`));
  if (m) {
    indice++;
    const selectorRaw = m[1];
    const selector = normalizarSelector(selectorRaw);
    nodos.push({
      indice,
      accion: m[2],
      selector,
      selectorRaw,
      etiqueta: extraerEtiqueta(selector),
      confiabilidad: calcularConfiabilidad(selectorRaw),
      raw: limpia,
    });
    continue;
  }

  // page.<SEL>.selectOption('valor')
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.selectOption\\(['"](.+?)['"]\\)`));
  if (m) {
    indice++;
    const selectorRaw = m[1];
    const selector = normalizarSelector(selectorRaw);
    nodos.push({
      indice,
      accion: 'selectOption',
      selector,
      selectorRaw,
      valor: m[2],
      etiqueta: extraerEtiqueta(selector),
      confiabilidad: calcularConfiabilidad(selectorRaw),
      raw: limpia,
    });
    continue;
  }

  // page.<SEL>.hover()
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.hover\\(\\)`));
  if (m) {
    indice++;
    const selectorRaw = m[1];
    const selector = normalizarSelector(selectorRaw);
    nodos.push({
      indice,
      accion: 'hover',
      selector,
      selectorRaw,
      etiqueta: extraerEtiqueta(selector),
      confiabilidad: calcularConfiabilidad(selectorRaw),
      raw: limpia,
    });
    continue;
  }
}

const resultado = {
  metadata: {
    numero: session.numero,
    nombre: session.nombre,
    canal: session.canal,
    urlInicial: session.urlInicial,
    qa: session.qa,
    fechaInicio: session.fechaInicio,
    fechaFin: session.fechaFin ?? null,
  },
  nodos,
  urlsVisitadas,
};

writeFileSync(outPath, JSON.stringify(resultado, null, 2), 'utf8');
console.log(`✅ Parseado: ${outPath} (${nodos.length} nodos, ${urlsVisitadas.length} URLs)`);
