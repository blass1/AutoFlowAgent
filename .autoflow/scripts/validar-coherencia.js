// Valida la coherencia del estado del proyecto antes de correr una regresión.
// Detecta:
//   - testsets que apuntan a specs que no existen
//   - sidecars cuyos ids no estan en nodos.json
//   - POs en pages/ que no tienen sidecar (o al reves)
//   - sidecars que referencian nodos deprecated sin reemplazo vivo
//   - testsets cuyos casos no aparecen en los specs
//
// Uso:
//   node .autoflow/scripts/validar-coherencia.js              # valida todo
//   node .autoflow/scripts/validar-coherencia.js <slug>       # valida solo el testset
//
// Salida en stdout: linea con prefijo AUTOFLOW_VALIDACION + JSON con
// `{ ok, errores: [...], warnings: [...] }`. Exit code 0 siempre — el
// consumidor decide si frenar.

const { readdirSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const slugFiltro = process.argv[2] ?? null;

const errores = [];
const warnings = [];

function err(msg) { errores.push(msg); }
function warn(msg) { warnings.push(msg); }

// 1. Cargar nodos.json
let nodos = {};
if (existsSync('.autoflow/nodos.json')) {
  try {
    nodos = JSON.parse(readFileSync('.autoflow/nodos.json', 'utf8'));
  } catch (e) {
    err(`nodos.json no es JSON valido: ${e.message}`);
  }
} else {
  warn('nodos.json no existe — primer arranque del proyecto?');
}

// 2. Cargar todos los sidecars
const sidecarsDir = '.autoflow/fingerprints';
const sidecars = {};
if (existsSync(sidecarsDir)) {
  for (const f of readdirSync(sidecarsDir).filter((x) => x.endsWith('.json'))) {
    const path = join(sidecarsDir, f);
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'));
      sidecars[data.page] = { ...data, _file: path };
    } catch (e) {
      err(`Sidecar ${path} no es JSON valido: ${e.message}`);
    }
  }
}

// 3. PO files vs sidecars
const pagesDir = 'pages';
const posExistentes = new Set();
function recorrerPages(dir) {
  if (!existsSync(dir)) return;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) recorrerPages(p);
    else if (ent.isFile() && ent.name.endsWith('Page.ts')) {
      posExistentes.add(ent.name.replace(/\.ts$/, ''));
    }
  }
}
recorrerPages(pagesDir);

for (const page of Object.keys(sidecars)) {
  if (!posExistentes.has(page)) {
    err(`Sidecar ${page}.json existe pero no encontre pages/${page}.ts (sidecar huerfano).`);
  }
}
for (const page of posExistentes) {
  if (!sidecars[page]) {
    warn(`pages/${page}.ts existe pero no tiene sidecar fingerprints/${page}.json.`);
  }
}

// 4. Cada id en cada sidecar debe vivir en nodos.json
for (const [page, sc] of Object.entries(sidecars)) {
  const ids = [...(sc.nodos ?? []), ...(sc.asserts ?? [])];
  for (const id of ids) {
    if (!nodos[id]) {
      err(`Sidecar ${page} referencia id "${id}" que no esta en nodos.json.`);
      continue;
    }
    const def = nodos[id];
    if (def.deprecated && !def.reemplazadoPor) {
      err(`Sidecar ${page} usa nodo deprecated "${id}" sin reemplazo vivo.`);
    } else if (def.deprecated && def.reemplazadoPor && !nodos[def.reemplazadoPor]) {
      err(`Nodo deprecated "${id}" apunta a reemplazadoPor "${def.reemplazadoPor}" que no existe.`);
    }
    if (def.page !== page) {
      warn(`Nodo "${id}" tiene page="${def.page}" pero esta en sidecar de "${page}".`);
    }
  }
}

// 5. Testsets
const testsetsDir = '.autoflow/testsets';
const testsetsAValidar = [];
if (existsSync(testsetsDir)) {
  for (const f of readdirSync(testsetsDir).filter((x) => x.endsWith('.json'))) {
    const slug = f.replace(/\.json$/, '');
    if (slugFiltro && slug !== slugFiltro) continue;
    testsetsAValidar.push({ slug, path: join(testsetsDir, f) });
  }
}

if (slugFiltro && testsetsAValidar.length === 0) {
  err(`Test set "${slugFiltro}" no existe en .autoflow/testsets/.`);
}

for (const ts of testsetsAValidar) {
  let data;
  try {
    data = JSON.parse(readFileSync(ts.path, 'utf8'));
  } catch (e) {
    err(`Test set ${ts.slug} no es JSON valido: ${e.message}`);
    continue;
  }
  const casos = Array.isArray(data.casos) ? data.casos : [];
  if (casos.length === 0) {
    warn(`Test set "${ts.slug}" no tiene casos.`);
  }
  // Recolectar specPaths unicos
  const specPaths = new Set();
  for (const caso of casos) {
    const sp = caso.specPath ?? caso.path ?? null;
    if (!sp) {
      err(`Test set "${ts.slug}" tiene caso sin specPath: ${JSON.stringify(caso)}`);
      continue;
    }
    specPaths.add(sp);
    if (!existsSync(sp)) {
      err(`Test set "${ts.slug}" referencia spec inexistente: ${sp}`);
    }
  }
  // Verificar que cada caso del set aparezca dentro de su spec
  for (const caso of casos) {
    const sp = caso.specPath ?? caso.path;
    const numero = caso.numero ?? caso.id;
    if (!sp || !numero || !existsSync(sp)) continue;
    const contenido = readFileSync(sp, 'utf8');
    const re = new RegExp(`test\\(['"\`]TC-${escapeRegex(String(numero))}\\b`);
    if (!re.test(contenido)) {
      warn(`Test set "${ts.slug}": caso TC-${numero} declarado pero no encontre test('TC-${numero} ...') en ${sp}.`);
    }
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ok = errores.length === 0;
console.log(`AUTOFLOW_VALIDACION: ${JSON.stringify({ ok, errores, warnings })}`);

if (!ok) {
  console.error('');
  console.error('❌ Errores de coherencia:');
  for (const e of errores) console.error(`   • ${e}`);
}
if (warnings.length > 0) {
  console.error('');
  console.error('⚠️  Warnings:');
  for (const w of warnings) console.error(`   • ${w}`);
}
if (ok && warnings.length === 0) {
  console.error('✅ Coherencia OK.');
}

process.exit(0);
