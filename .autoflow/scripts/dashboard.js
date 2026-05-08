// Genera .autoflow/dashboard.html — un único HTML estático y autocontenido para
// que el QA navegue Test Sets, Tests, pasos del flujo, ejecuciones y el grafo
// del paso a paso. Sin server, sin deps. Vanilla JS + datos inline.
//
// Estado leído (snapshot al momento de correr el script):
//   .autoflow/testsets/*.json     — definición de cada Test Set
//   .autoflow/recordings/*.json   — sessions + paths (traza)
//   .autoflow/fingerprints/*.json — sidecars de Page Objects
//   .autoflow/nodos.json          — diccionario global de Nodos
//   .autoflow/runs/*.json         — historial de ejecuciones
//   tests/*.spec.ts               — Tests parseados (test.describe + test)
//   pages/**/*.ts                 — para resolver línea del locator de cada Nodo
//
// Uso:
//   node .autoflow/scripts/dashboard.js          → escribe el HTML
//   node .autoflow/scripts/dashboard.js --open   → escribe + abre en el navegador

const { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } = require('node:fs');
const { join, resolve, relative, sep } = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = process.cwd();
const OUT = '.autoflow/dashboard.html';

// ---------------------------------------------------------------------------
// Lectura del estado
// ---------------------------------------------------------------------------

function leerJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return fallback; }
}

function listarArchivos(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext) && f !== '.gitkeep')
    .map((f) => join(dir, f));
}

function listarTs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listarTs(p));
    else if (f.endsWith('.ts')) out.push(p);
  }
  return out;
}

function cargarTestSets() {
  return listarArchivos('.autoflow/testsets', '.json')
    .map((p) => leerJson(p))
    .filter(Boolean);
}

function cargarUsuario() {
  return leerJson('.autoflow/user.json', null);
}

function cargarManual() {
  const path = '.autoflow/scripts/dashboard-manual.md';
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// Color determinístico por nombre — misma string siempre da el mismo hue.
// Saturación y lightness fijos para que todos se vean balanceados en dark theme.
function colorParaNombre(nombre) {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function cargarNodos() {
  return leerJson('.autoflow/nodos.json', {});
}

function cargarSidecars() {
  const out = {};
  for (const p of listarArchivos('.autoflow/fingerprints', '.json')) {
    const sc = leerJson(p);
    if (sc?.page) out[sc.page] = sc;
  }
  return out;
}

function cargarRecordings() {
  const sessions = {};
  const paths = {};
  if (!existsSync('.autoflow/recordings')) return { sessions, paths };
  for (const f of readdirSync('.autoflow/recordings')) {
    if (!f.endsWith('.json') || f === '.gitkeep') continue;
    const m1 = f.match(/^(.+)-session\.json$/);
    const m2 = f.match(/^(.+)-path\.json$/);
    if (m1) sessions[m1[1]] = leerJson(join('.autoflow/recordings', f));
    if (m2) paths[m2[1]] = leerJson(join('.autoflow/recordings', f));
  }
  return { sessions, paths };
}

function cargarRuns() {
  return listarArchivos('.autoflow/runs', '.json')
    .map((p) => leerJson(p))
    .filter(Boolean)
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
}

// Parser muy simple del spec: extrae nombre del test.describe y los test() adentro.
// Espera el formato del repo: `test.describe('{nombre} [testSetId:{id}]', () => { test('{nombre} [testId:{numero}]', ...) })`.
function parsearSpec(specPath) {
  if (!specPath || !existsSync(specPath)) {
    return { specExiste: false, specSize: 0, describe: null, tests: [], imports: [] };
  }
  const src = readFileSync(specPath, 'utf8');
  // Backreferences (\1) para que el delimitador de cierre sea el mismo que el de apertura.
  // Aguanta nombres con comillas escapadas (ej: `"Test 'smoke' suite"`).
  const describe = src.match(/test\.describe\(\s*(['"`])(.+?)\s*\[testSetId:(\d+)\]\s*\1/);
  const tests = [];
  const re = /test\(\s*(['"`])(.+?)\s*\[testId:(\d+)\]\s*\1/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    tests.push({ nombre: m[2].trim(), testId: m[3] });
  }
  // Imports de Page Objects. Aceptamos varias variantes:
  //  • Default:        import LoginPage from '../pages/LoginPage'
  //  • Default + .ts:  import LoginPage from '../pages/LoginPage.ts'
  //  • Subdir:         import LoginPage from '../../pages/auth/LoginPage'
  //  • Named single:   import { LoginPage } from '../pages/LoginPage'
  //  • Named múltiple: import { LoginPage, RegisterPage } from '../pages/auth'
  //  • Paths con `-` o `_`: import LoginPage from '../pages/auth-mobile/LoginPage'
  // Ignoramos `import type` (no genera código a runtime, no es un PO usado).
  // El path destino tiene que contener `pages/` en algún lugar — eso filtra imports
  // de fixtures/data/types que no son POs.
  const imports = [];
  const seen = new Set();
  // Default imports: import X from '<path>/pages/...'
  // [\w/-] acepta letras, números, _, /, -. .ts opcional.
  const reDef = /import\s+(?!type\b)(\w+)\s+from\s+['"`]([^'"`]*pages\/[\w/-]+?)(?:\.ts)?['"`]/g;
  while ((m = reDef.exec(src)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); imports.push({ nombreClase: m[1], rutaSinExt: m[2], origen: 'import' }); }
  }
  // Named imports: import { X, Y } from '<path>/pages/...'
  const reNamed = /import\s+(?!type\b)\{([^}]+)\}\s+from\s+['"`]([^'"`]*pages\/[\w/-]+?)(?:\.ts)?['"`]/g;
  while ((m = reNamed.exec(src)) !== null) {
    const nombres = m[1].split(',').map((s) => s.trim().replace(/\s+as\s+\w+/, '')).filter(Boolean);
    for (const nombre of nombres) {
      if (/^\w+$/.test(nombre) && !seen.has(nombre)) {
        seen.add(nombre);
        imports.push({ nombreClase: nombre, rutaSinExt: m[2], origen: 'import' });
      }
    }
  }
  return {
    describe: describe ? { nombre: describe[1].trim(), testSetId: describe[2] } : null,
    tests,
    imports,
    specExiste: true,
    specSize: src.length,
  };
}

// Para cada Page Object intentamos sacar las líneas donde se asignan los locators
// (constructor: `this.x = page.{selectorRaw}`) y los métodos públicos. Best-effort regex.
function indexarPaginas() {
  const out = {};
  for (const p of listarTs('pages')) {
    const src = readFileSync(p, 'utf8');
    const lines = src.split('\n');
    const claseMatch = src.match(/export\s+default\s+class\s+(\w+)/);
    if (!claseMatch) continue;
    const clase = claseMatch[1];
    const locators = []; // { selectorRaw, line }
    const metodos = []; // { nombre, line, retornaPage }
    for (let i = 0; i < lines.length; i++) {
      const linea = lines[i];
      const mLoc = linea.match(/=\s*(?:this\.)?page\.(.+?);?\s*$/);
      if (mLoc) locators.push({ selectorRaw: mLoc[1].trim().replace(/;$/, ''), line: i + 1 });
      // Métodos públicos: `async <nombre>(...)` que NO arranque con private/#.
      const mMet = linea.match(/^\s*(?:public\s+)?async\s+(\w+)\s*\(/);
      if (mMet && !linea.includes('private') && !linea.includes('#')) {
        // Buscar si el método retorna otra Page (heurística: hay `return new XxxPage` en próximas líneas).
        let retornaPage = null;
        for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
          const mRet = lines[j].match(/return\s+new\s+(\w+Page)\(/);
          if (mRet) { retornaPage = mRet[1]; break; }
          if (/^\s*}\s*$/.test(lines[j])) break;
        }
        metodos.push({ nombre: mMet[1], line: i + 1, retornaPage });
      }
    }
    out[clase] = { archivo: p, locators, metodos };
  }
  return out;
}

function buscarLineaDelLocator(paginas, page, selectorRaw) {
  const info = paginas[page];
  if (!info) return null;
  // Match exacto primero, después fuzzy (por si el archivo tiene comments/whitespace).
  const exacta = info.locators.find((l) => l.selectorRaw === selectorRaw);
  if (exacta) return { archivo: info.archivo, line: exacta.line };
  const aprox = info.locators.find((l) => l.selectorRaw.startsWith(selectorRaw.split(/[.(]/)[0]));
  if (aprox) return { archivo: info.archivo, line: aprox.line };
  return { archivo: info.archivo, line: 1 };
}

// ---------------------------------------------------------------------------
// Armado del modelo para la UI
// ---------------------------------------------------------------------------

function construirModelo() {
  const sets = cargarTestSets();
  const nodos = cargarNodos();
  const sidecars = cargarSidecars();
  const { sessions, paths } = cargarRecordings();
  const runs = cargarRuns();
  const paginas = indexarPaginas();
  const usuario = cargarUsuario();
  const manual = cargarManual();

  // Por cada Test Set, parseamos el spec y armamos los Tests con sus pasos (traza).
  const testSets = sets.map((set) => {
    // Resolución de specPath con 3 niveles de fallback:
    //   1. Nivel raíz (lo correcto según convención).
    //   2. Dentro del primer caso (formato viejo o agente que lo metió ahí por error).
    //   3. Calculado del patrón canónico tests/{slug}-{id}.spec.ts (último recurso —
    //      cubre el caso de testset.json sin specPath en ningún lado pero con slug + id válidos).
    const specPathCanonico = set.slug && set.id ? `tests/${set.slug}-${set.id}.spec.ts` : null;
    const specPathFinal = set.specPath ?? set.casos?.[0]?.specPath ?? specPathCanonico;
    const parsed = specPathFinal ? parsearSpec(specPathFinal) : null;
    const tests = (parsed?.tests || []).map((t) => {
      const pathTraza = paths[t.testId];
      const session = sessions[t.testId];
      const pasos = (pathTraza?.path || []).map((id) => {
        const nodo = nodos[id] || null;
        let abrir = null;
        if (nodo?.page && nodo?.selectorRaw) {
          const ubic = buscarLineaDelLocator(paginas, nodo.page, nodo.selectorRaw);
          if (ubic) abrir = ubic;
        }
        return { id, nodo, abrir };
      });
      // Pages únicas que toca este Test (en orden de aparición).
      const pagesDelTest = [];
      const seen = new Set();
      for (const p of pasos) {
        if (p.nodo?.page && !seen.has(p.nodo.page)) {
          seen.add(p.nodo.page);
          pagesDelTest.push(p.nodo.page);
        }
      }
      return {
        testId: t.testId,
        nombre: t.nombre,
        pasos,
        pagesDelTest,
        sessionExiste: !!session,
        almContext: session?.almContext ?? null,
        canal: session?.canal ?? null,
        bufferTiempo: session?.bufferTiempo ?? null,
      };
    });
    return {
      slug: set.slug,
      id: set.id,
      nombre: set.nombre,
      descripcion: set.descripcion ?? '',
      specPath: specPathFinal,
      specExiste: parsed?.specExiste ?? false,
      describe: parsed?.describe ?? null,
      imports: parsed?.imports ?? [],
      tests,
    };
  });

  // Nota: con la convención sin chains, el spec importa directamente todas las
  // pages que usa (las instancia al inicio del test()). Por eso ya no es necesario
  // recorrer una "cadena de retornos" entre POs — los imports del spec son la
  // fuente de verdad completa.

  // Resolución absoluta de archivos para vscode://file/.
  const absPath = (rel) => resolve(ROOT, rel).replace(/\\/g, '/');

  // Enriquecer cada page con métricas: nodos, métodos, confiabilidad promedio,
  // cantidad de Tests que la usan, color determinístico.
  const paginasOut = {};
  for (const [nombrePage, info] of Object.entries(paginas)) {
    const sidecar = sidecars[nombrePage];
    const idsDelSidecar = [...(sidecar?.nodos ?? []), ...(sidecar?.asserts ?? [])];
    const nodosResueltos = idsDelSidecar.map((id) => nodos[id]).filter(Boolean);
    // Filtramos deprecated: bajan artificialmente el promedio si los incluimos.
    const confs = nodosResueltos
      .filter((n) => !n.deprecated)
      .map((n) => n.confiabilidad)
      .filter((c) => typeof c === 'number');
    const confPromedio = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
    const usadoEnTests = [];
    for (const ts of testSets) {
      for (const t of ts.tests) {
        if (t.pagesDelTest.includes(nombrePage)) {
          usadoEnTests.push({ testSetSlug: ts.slug, testId: t.testId, nombreTest: t.nombre });
        }
      }
    }
    paginasOut[nombrePage] = {
      archivo: info.archivo,
      archivoAbs: absPath(info.archivo),
      locators: info.locators.length,
      metodos: info.metodos,
      conecta: sidecar?.conecta ?? [],
      cantidadNodos: sidecar?.nodos?.length ?? 0,
      cantidadAsserts: sidecar?.asserts?.length ?? 0,
      confPromedio,
      usadoEnTests,
      hue: colorParaNombre(nombrePage),
    };
  }

  return {
    generadoEn: new Date().toISOString(),
    proyecto: relative(resolve(ROOT, '..'), ROOT) || ROOT.split(sep).pop(),
    rootAbs: absPath('.'),
    usuario,
    manual,
    testSets,
    runs,
    nodos,
    sidecars,
    paginas: paginasOut,
  };
}

// ---------------------------------------------------------------------------
// Generación del HTML
// ---------------------------------------------------------------------------

function escapar(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function html(modelo) {
  const datosJson = JSON.stringify(modelo).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>AutoFlow — Dashboard</title>
<style>
  :root {
    /* Paleta Galicia — naranja vivo + indigo profundo del logo y la tarjeta */
    --bg: #0d0d1a;          /* near-black con tinte violeta */
    --panel: #161628;       /* panel ligeramente más claro */
    --panel2: #1f1f36;      /* aún más claro para hover/active */
    --text: #f3f0e7;        /* off-white cálido (tono manteca) */
    --muted: #9d99af;       /* gris con tinte violeta */
    --accent: #ff6f1d;      /* 🟠 Naranja Galicia — primario para highlights */
    --accent2: #4d3a8a;     /* violeta intermedio (avatares de Manual, etc.) */
    --indigo: #2a2168;      /* 🟣 Indigo Galicia — base sobria */
    --galicia-grad: linear-gradient(180deg, #2a2168 0%, #ff6f1d 100%);
    --ok: #3ddc97;
    --bad: #ff5c7a;
    --warn: #ffb454;
    --border: #2a2640;      /* borde con tinte indigo */
    --chip: #1f1d36;        /* chip con tinte indigo */
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  button {
    background: transparent; color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-family: inherit;
  }
  button:hover { border-color: var(--accent); color: var(--accent); }
  button.primary { background: var(--accent); border-color: var(--accent); color: white; }
  button.primary:hover { color: white; opacity: 0.9; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px;
    background: var(--chip); padding: 1px 6px; border-radius: 4px; }
  .chip { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px;
    background: var(--chip); color: var(--muted); margin-right: 4px; }
  .chip.ok { background: rgba(61,220,151,0.15); color: var(--ok); }
  .chip.bad { background: rgba(255,92,122,0.15); color: var(--bad); }
  .chip.warn { background: rgba(255,180,84,0.15); color: var(--warn); }
  .conf-1 { color: var(--bad); }
  .conf-2 { color: var(--warn); }
  .conf-3 { color: #ffd966; }
  .conf-4 { color: #b6e88f; }
  .conf-5 { color: var(--ok); }

  header {
    display: flex; align-items: center; gap: 16px; padding: 10px 16px;
    border-bottom: 2px solid var(--accent);
    background: linear-gradient(135deg, var(--indigo) 0%, #1c1430 100%);
    position: sticky; top: 0; z-index: 10;
  }
  header h1 { margin: 0; font-size: 15px; font-weight: 600; }
  header .meta { color: var(--muted); font-size: 12px; }
  header .toolbar { margin-left: auto; display: flex; gap: 6px; }

  .layout { display: grid; grid-template-columns: 280px 1fr; height: calc(100vh - 50px); }
  aside { border-right: 1px solid var(--border); overflow: auto; background: var(--panel); }
  aside h2 { font-size: 11px; text-transform: uppercase; color: var(--muted); margin: 16px 12px 6px; letter-spacing: 0.06em; }
  .user-row { padding: 10px 12px; cursor: pointer; border-left: 3px solid transparent;
    display: flex; align-items: center; gap: 10px; }
  .user-row:hover { background: var(--panel2); }
  .user-row.active { background: var(--panel2); border-left-color: var(--accent); }
  .user-row .avatar { width: 32px; height: 32px; border-radius: 50%; flex: 0 0 32px;
    display: flex; align-items: center; justify-content: center; font-weight: 700; color: white; font-size: 13px; }
  .user-row .info .nombre { font-weight: 600; font-size: 13px; }
  .user-row .info .meta-line { color: var(--muted); font-size: 11px; margin-top: 1px; }
  .ts-row { padding: 6px 12px; cursor: pointer; border-left: 3px solid transparent; }
  .ts-row:hover { background: var(--panel2); }
  .ts-row.active { background: var(--panel2); border-left-color: var(--accent); }
  .ts-row .nombre { font-weight: 600; }
  .ts-row .meta-line { color: var(--muted); font-size: 11px; margin-top: 2px; }
  .t-row { padding: 6px 12px 4px 28px; cursor: pointer; font-size: 13px;
    display: flex; flex-direction: column; gap: 4px; }
  .t-row:hover { background: var(--panel2); }
  .t-row.active { background: var(--panel2); color: var(--accent); }
  .t-row .t-titulo { display: flex; align-items: flex-start; gap: 6px;
    flex-wrap: wrap; word-break: break-word; line-height: 1.35; }
  /* Barra horizontal — cada page es un segmento conectado, sin gap, mostrando el orden de visita */
  .t-pagebar { display: flex; height: 3px; border-radius: 2px; overflow: hidden;
    margin-left: 0; opacity: 0.85; }
  .t-pagebar .seg { flex: 1; min-width: 4px; }
  .t-pagebar:empty { display: none; }

  main { overflow: auto; padding: 0; }
  .tabs { display: flex; gap: 4px; padding: 12px 20px 0; border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--bg); z-index: 5; }
  .tab { padding: 8px 14px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--muted); font-size: 13px; }
  .tab.active { color: var(--text); border-bottom-color: var(--accent); }
  .panel { padding: 20px; }
  .panel h2 { font-size: 16px; margin: 0 0 12px; font-weight: 600; }
  .panel h3 { font-size: 13px; margin: 18px 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); }
  th { font-weight: 600; color: var(--muted); font-size: 11px; text-transform: uppercase; }
  tbody tr:hover { background: var(--panel); }

  .paso-row { display: grid; grid-template-columns: 50px 1fr auto auto; gap: 12px; padding: 8px 12px;
    border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; cursor: pointer; align-items: center;
    border-left-width: 4px; }
  .paso-row:hover { background: var(--panel); }
  .paso-row.deprecated { opacity: 0.5; }
  .paso-row .idx { color: var(--muted); font-family: monospace; }
  .paso-row .descripcion { font-family: monospace; font-size: 12px; }
  .paso-row .descripcion .page { font-weight: 600; }
  .paso-row .descripcion .accion { color: var(--warn); }
  .paso-row .conf { font-family: monospace; font-size: 11px; }

  /* Page Object cards — grid de 7 por fila (responsive en pantallas chicas) */
  .po-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
  @media (max-width: 1400px) { .po-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
  @media (max-width: 1024px) { .po-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .po-card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 12px; cursor: default;
    border-top: 3px solid var(--border); position: relative; overflow: hidden;
  }
  .po-card .po-name { font-weight: 600; font-size: 12px; line-height: 1.2; margin-bottom: 6px;
    overflow-wrap: break-word; word-break: break-word; }
  .po-card .po-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; font-size: 10px; color: var(--muted); }
  .po-card .po-stats .num { font-weight: 700; color: var(--text); font-size: 13px; display: block; }
  .po-card .po-conf {
    display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 10px;
    font-family: monospace; margin-top: 6px;
  }
  .po-card.huerfano { opacity: 0.55; border-style: dashed; }
  .po-card.huerfano::after { content: '🔌'; position: absolute; top: 6px; right: 6px; font-size: 10px; }

  /* Vista del Manual */
  .manual-layout { display: grid; grid-template-columns: 220px 1fr; gap: 24px; max-width: 1100px; }
  .manual-toc { position: sticky; top: 12px; align-self: start; max-height: calc(100vh - 100px); overflow: auto;
    border-right: 1px solid var(--border); padding-right: 12px; font-size: 13px; }
  .manual-toc h4 { font-size: 11px; text-transform: uppercase; color: var(--muted);
    margin: 0 0 8px; letter-spacing: 0.06em; }
  .manual-toc a { display: block; padding: 4px 8px; border-radius: 4px; color: var(--text); margin: 2px 0; }
  .manual-toc a:hover { background: var(--panel); text-decoration: none; }
  .manual-content { font-size: 15px; line-height: 1.65; }
  .manual-content h1 { font-size: 28px; margin: 0 0 8px; }
  .manual-content h2 { font-size: 22px; margin: 32px 0 12px; padding-bottom: 6px;
    border-bottom: 1px solid var(--border); scroll-margin-top: 12px; }
  .manual-content h3 { font-size: 17px; margin: 24px 0 8px; color: var(--accent); }
  .manual-content p { margin: 8px 0; }
  .manual-content ul, .manual-content ol { padding-left: 22px; }
  .manual-content li { margin: 4px 0; }
  .manual-content code { background: var(--chip); padding: 2px 6px; border-radius: 4px;
    font-size: 13px; font-family: "SF Mono", Menlo, Consolas, monospace; }
  .manual-content pre { background: var(--panel); border: 1px solid var(--border);
    padding: 14px 16px; border-radius: 6px; overflow: auto; font-size: 13px; line-height: 1.55; }
  .manual-content pre code { background: transparent; padding: 0; }
  .manual-content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  .manual-content th, .manual-content td { text-align: left; padding: 8px 12px;
    border-bottom: 1px solid var(--border); vertical-align: top; }
  .manual-content th { font-weight: 600; color: var(--muted); font-size: 12px;
    text-transform: uppercase; letter-spacing: 0.06em; }
  .manual-content blockquote { border-left: 3px solid var(--accent); padding: 4px 14px;
    color: var(--muted); font-style: italic; margin: 12px 0; }
  .manual-content hr { border: none; border-top: 1px solid var(--border); margin: 32px 0; }
  .manual-content a { color: var(--accent); }

  /* Vista de Usuario */
  .user-form { max-width: 540px; }
  .user-form .field { margin-bottom: 14px; }
  .user-form label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .user-form input { width: 100%; background: var(--panel); border: 1px solid var(--border);
    color: var(--text); padding: 8px 10px; border-radius: 6px; font-family: inherit; font-size: 14px; }
  .user-form input:focus { outline: none; border-color: var(--accent); }
  .user-form .acciones { display: flex; gap: 8px; margin-top: 16px; }
  .user-form .preview { background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
    padding: 12px; margin-top: 16px; font-size: 12px; font-family: monospace; white-space: pre; overflow: auto; }

  .empty { color: var(--muted); padding: 20px; text-align: center; font-style: italic; }

  /* Modal */
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: none; z-index: 100; }
  .modal-bg.show { display: flex; align-items: center; justify-content: center; }
  .modal { background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    padding: 20px; max-width: 600px; width: 92%; max-height: 80vh; overflow: auto; }
  .modal h3 { margin: 0 0 12px; font-size: 14px; text-transform: uppercase; color: var(--muted); }
  .modal dl { display: grid; grid-template-columns: 110px 1fr; gap: 6px 12px; margin: 0 0 16px; font-size: 13px; }
  .modal dt { color: var(--muted); }
  .modal dd { margin: 0; word-break: break-all; font-family: monospace; font-size: 12px; }
  .modal .acciones { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

  /* Grafo */
  #grafoStage { width: 100%; height: calc(100vh - 200px); overflow: hidden; cursor: grab;
    border: 1px solid var(--border); border-radius: 6px; background: var(--panel); }
  #grafoStage.dragging { cursor: grabbing; }
  #grafoStage svg { width: 100%; height: 100%; }
  .grafo-vacio { color: var(--muted); padding: 60px; text-align: center; }
</style>
</head>
<body>
  <header>
    <h1>🌊 AutoFlow — Dashboard</h1>
    <div class="meta" id="metaProyecto"></div>
    <div class="toolbar">
      <button onclick="location.reload()">🔄 Recargar</button>
    </div>
  </header>

  <div class="layout">
    <aside id="sidebar"></aside>
    <main id="main"><div class="empty">Elegí un Test Set o un Test del panel izquierdo.</div></main>
  </div>

  <div class="modal-bg" id="modal">
    <div class="modal" id="modalContent"></div>
  </div>

  <script id="datos" type="application/json">${datosJson}</script>

  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/+esm';
    // Configurar marked para que genere ids slugificados en headings (para el TOC del manual).
    marked.use({
      gfm: true,
      breaks: false,
      headerIds: true,
      headerPrefix: '',
    });
    window.marked = marked;
    import svgPanZoom from 'https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/+esm';

    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: { htmlLabels: true, useMaxWidth: false, curve: 'basis' },
    });

    const datos = JSON.parse(document.getElementById('datos').textContent);
    const $ = (id) => document.getElementById(id);
    let estado = { vista: 'inicio', tsSlug: null, testId: null, tab: 'detalles' };

    // Color helpers — todos los lugares donde aparezca una page usan el mismo hue.
    function colorPage(nombrePage) {
      const info = datos.paginas[nombrePage];
      const hue = info ? info.hue : Math.abs([...nombrePage].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 360;
      return { bg: \`hsl(\${hue}, 55%, 22%)\`, fg: \`hsl(\${hue}, 65%, 70%)\`, border: \`hsl(\${hue}, 65%, 55%)\` };
    }
    function iniciales(nombre) {
      if (!nombre) return '?';
      return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    }

    function fmtFecha(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    }
    function fmtDur(ms) {
      if (!ms) return '—';
      if (ms < 1000) return ms + 'ms';
      return (ms / 1000).toFixed(1) + 's';
    }

    $('metaProyecto').innerHTML =
      \`<span class="chip">Proyecto: \${datos.proyecto}</span>\` +
      \`<span class="chip">Generado: \${fmtFecha(datos.generadoEn)}</span>\` +
      \`<span class="chip">\${datos.testSets.length} **Test Sets**</span>\`.replace(/\\*\\*(.+?)\\*\\*/g, '<b>$1</b>');

    function renderSidebar() {
      const html = [];

      // — Sección Usuario —
      html.push('<h2>Usuario</h2>');
      const u = datos.usuario;
      const nombreU = u?.nombre || '(sin configurar)';
      const hueU = colorPage(nombreU);
      const activeUser = estado.vista === 'usuario' ? 'active' : '';
      html.push(\`
        <div class="user-row \${activeUser}" onclick="abrirUsuario()">
          <div class="avatar" style="background: \${hueU.border};">\${esc(iniciales(nombreU))}</div>
          <div class="info">
            <div class="nombre">\${esc(nombreU)}</div>
            <div class="meta-line">\${u ? esc((u.equipo || '—') + ' · ' + (u.tribu || '—')) : 'Hacé click para configurar'}</div>
          </div>
        </div>
      \`);

      // — Sección Manual —
      if (datos.manual) {
        const activeManual = estado.vista === 'manual' ? 'active' : '';
        html.push(\`
          <div class="user-row \${activeManual}" onclick="abrirManual()" style="margin-top: 4px;">
            <div class="avatar" style="background: var(--accent2);">📖</div>
            <div class="info">
              <div class="nombre">Manual de uso</div>
              <div class="meta-line">Tutorial, conceptos, troubleshooting</div>
            </div>
          </div>
        \`);
      }

      // — Sección Test Sets —
      html.push('<h2>Test Sets</h2>');
      if (datos.testSets.length === 0) {
        html.push('<div class="empty">No hay Test Sets todavía.</div>');
      } else {
        for (const ts of datos.testSets) {
          const active = estado.vista === 'testset' && estado.tsSlug === ts.slug && !estado.testId ? 'active' : '';
          html.push(\`
            <div class="ts-row \${active}" onclick="seleccionarTS('\${ts.slug}')">
              <div class="nombre">\${esc(ts.nombre)}</div>
              <div class="meta-line">[testSetId:\${ts.id}] · \${ts.tests.length} Tests</div>
            </div>
          \`);
          if (estado.tsSlug === ts.slug && estado.vista !== 'usuario') {
            for (const t of ts.tests) {
              const a2 = estado.testId === t.testId ? 'active' : '';
              // Barra horizontal — cada page es un segmento conectado en el orden de visita.
              const segmentos = (t.pagesDelTest || []).map((p) => {
                const c = colorPage(p);
                return \`<span class="seg" style="background:\${c.border}" title="\${esc(p)}"></span>\`;
              }).join('');
              html.push(\`
                <div class="t-row \${a2}" onclick="seleccionarTest('\${ts.slug}','\${t.testId}')">
                  <div class="t-titulo">▸ \${esc(t.nombre)} <span style="color:var(--muted)">[\${t.testId}]</span></div>
                  <div class="t-pagebar">\${segmentos}</div>
                </div>
              \`);
            }
          }
        }
      }
      $('sidebar').innerHTML = html.join('');
    }

    function seleccionarTS(slug) {
      estado = { vista: 'testset', tsSlug: slug, testId: null, tab: 'detalles' };
      render();
    }
    function seleccionarTest(slug, testId) {
      estado = { vista: 'testset', tsSlug: slug, testId, tab: 'detalles' };
      render();
    }
    function abrirUsuario() {
      estado = { vista: 'usuario', tsSlug: null, testId: null, tab: 'detalles' };
      render();
    }
    function abrirManual() {
      estado = { vista: 'manual', tsSlug: null, testId: null, tab: 'detalles' };
      render();
    }
    function elegirTab(tab) { estado.tab = tab; renderMain(); }

    window.seleccionarTS = seleccionarTS;
    window.seleccionarTest = seleccionarTest;
    window.abrirUsuario = abrirUsuario;
    window.abrirManual = abrirManual;
    window.elegirTab = elegirTab;

    function getTS() { return datos.testSets.find((s) => s.slug === estado.tsSlug); }
    function getTest() {
      const ts = getTS(); if (!ts) return null;
      return ts.tests.find((t) => t.testId === estado.testId);
    }

    function tabsHtml(tabs) {
      return '<div class="tabs">' + tabs.map((t) =>
        \`<div class="tab \${estado.tab === t.id ? 'active' : ''}" onclick="elegirTab('\${t.id}')">\${t.label}</div>\`
      ).join('') + '</div>';
    }

    function renderMain() {
      if (estado.vista === 'usuario') { renderUsuario(); return; }
      if (estado.vista === 'manual') { renderManual(); return; }
      if (estado.vista === 'testset' && estado.tsSlug) {
        if (estado.testId) renderTest();
        else renderTestSet();
        return;
      }
      $('main').innerHTML = '<div class="empty">Elegí un Test Set, un Test, el Manual de uso o tu perfil de Usuario del panel izquierdo.</div>';
    }

    function renderManual() {
      if (!datos.manual) {
        $('main').innerHTML = '<div class="empty">Manual no encontrado. Verificá que .autoflow/scripts/dashboard-manual.md exista.</div>';
        return;
      }
      // Convertir markdown a HTML usando marked (cargado al inicio del script).
      const htmlManual = window.marked ? window.marked.parse(datos.manual) : esc(datos.manual);
      // Armar TOC con los h2 (sin tocar el HTML rendereado).
      const tocItems = [];
      const h2Re = /^## (.+)$/gm;
      let m;
      while ((m = h2Re.exec(datos.manual)) !== null) {
        const titulo = m[1].trim();
        // El id se genera por marked siguiendo su slugify (lower-case, espacios a -, etc.).
        const slug = titulo.toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
        tocItems.push({ titulo, slug });
      }
      const tocHtml = tocItems.length
        ? \`<h4>En este manual</h4>\${tocItems.map((t) => \`<a href="#\${t.slug}">\${esc(t.titulo)}</a>\`).join('')}\`
        : '';
      $('main').innerHTML = \`
        <div class="panel">
          <div class="manual-layout">
            <nav class="manual-toc">\${tocHtml}</nav>
            <div class="manual-content">\${htmlManual}</div>
          </div>
        </div>
      \`;
      // Smooth scroll en los anchors del TOC.
      for (const a of $('main').querySelectorAll('.manual-toc a')) {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const id = a.getAttribute('href').slice(1);
          const target = $('main').querySelector(\`#\${CSS.escape(id)}\`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }

    function renderUsuario() {
      const u = datos.usuario || { nombre: '', legajo: '', equipo: '', tribu: '' };
      const cuerpo = \`
        <div class="panel" style="max-width: 720px;">
          <h2>👤 Mi perfil</h2>
          <p style="color: var(--muted); font-size: 14px;">
            Datos del QA, persistidos en <code>.autoflow/user.json</code>. Se usan para registrar quién creó cada Test Set y Test.
            Como el dashboard es un HTML estático no puede escribir en disco directamente; al guardar te genera un <strong>prompt</strong> para pegar en el chat de AutoFlow y el agente actualiza el archivo.
          </p>
          <div class="user-form">
            <div class="field"><label for="f-nombre">Nombre</label><input id="f-nombre" type="text" value="\${esc(u.nombre || '')}"></div>
            <div class="field"><label for="f-legajo">Legajo</label><input id="f-legajo" type="text" value="\${esc(u.legajo || '')}"></div>
            <div class="field"><label for="f-equipo">Equipo</label><input id="f-equipo" type="text" value="\${esc(u.equipo || '')}"></div>
            <div class="field"><label for="f-tribu">Tribu</label><input id="f-tribu" type="text" value="\${esc(u.tribu || '')}"></div>
            <div class="acciones">
              <button class="primary" onclick="guardarUsuarioPrompt()">📋 Copiar prompt para guardar</button>
              <button onclick="descargarUsuarioJson()">💾 Descargar user.json</button>
              <button onclick="abrirVSCode('.autoflow/user.json', 1)">📂 Abrir user.json en VSCode</button>
            </div>
            <div id="userPreview" class="preview" style="display:none"></div>
          </div>
          \${u?.creadoEn ? \`<p style="color:var(--muted); font-size:12px; margin-top:24px">Creado en: \${esc(new Date(u.creadoEn).toLocaleString('es-AR'))}</p>\` : ''}
        </div>
      \`;
      $('main').innerHTML = cuerpo;
    }

    window.guardarUsuarioPrompt = () => {
      const nombre = $('f-nombre').value.trim();
      const legajo = $('f-legajo').value.trim();
      const equipo = $('f-equipo').value.trim();
      const tribu = $('f-tribu').value.trim();
      const datosNuevos = { nombre, legajo, equipo, tribu };
      const json = JSON.stringify({ ...datosNuevos, creadoEn: datos.usuario?.creadoEn || new Date().toISOString() }, null, 2);
      const prompt = \`Actualizá .autoflow/user.json con estos datos exactos (mantené el campo creadoEn si ya existe):\\n\\n\\\`\\\`\\\`json\\n\${json}\\n\\\`\\\`\\\`\`;
      const preview = $('userPreview');
      preview.style.display = 'block';
      preview.textContent = prompt;
      copiar(prompt);
    };

    window.descargarUsuarioJson = () => {
      const datosNuevos = {
        nombre: $('f-nombre').value.trim(),
        legajo: $('f-legajo').value.trim(),
        equipo: $('f-equipo').value.trim(),
        tribu: $('f-tribu').value.trim(),
        creadoEn: datos.usuario?.creadoEn || new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(datosNuevos, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'user.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };

    function renderTestSet() {
      const ts = getTS();
      const tabs = [
        { id: 'detalles', label: 'Detalles' },
        { id: 'tests', label: \`Tests (\${ts.tests.length})\` },
        { id: 'ejecuciones', label: 'Ejecuciones' },
      ];
      let cuerpo = '';
      if (estado.tab === 'detalles') {
        // Page Objects usados como grid de 7 cards por fila con data útil.
        // Si no hay imports detectados, mostramos un mensaje DIAGNÓSTICO en lugar de uno genérico.
        let cardsHtml;
        if (ts.imports.length > 0) {
          cardsHtml = '<div class="po-grid">' + ts.imports.map((i) => {
              const info = datos.paginas[i.nombreClase];
              const c = colorPage(i.nombreClase);
              if (!info) {
                // PO importado pero sin sidecar (huérfano o muy nuevo).
                return \`
                  <div class="po-card huerfano" style="border-top-color: \${c.border};">
                    <div class="po-name" style="color: \${c.fg}">\${esc(i.nombreClase)}</div>
                    <div class="po-stats"><div><span class="num">—</span>sin sidecar</div></div>
                  </div>\`;
              }
              const conf = info.confPromedio;
              const confChip = conf == null ? '' :
                \`<div class="po-conf" style="background: \${c.bg}; color: \${c.fg}">\${conf.toFixed(1)}/5</div>\`;
              const tests = info.usadoEnTests.length;
              return \`
                <div class="po-card" style="border-top-color: \${c.border};" title="\${esc(info.archivo)}">
                  <div class="po-name" style="color: \${c.fg}">\${esc(i.nombreClase)}</div>
                  <div class="po-stats">
                    <div><span class="num">\${info.locators}</span>locators</div>
                    <div><span class="num">\${info.metodos.length}</span>métodos</div>
                    <div><span class="num">\${info.cantidadNodos}</span>nodos</div>
                    <div><span class="num">\${tests}</span>tests</div>
                  </div>
                  \${confChip}
                </div>\`;
            }).join('') + '</div>';
        } else if (!ts.specExiste) {
          cardsHtml = \`<p class="empty">El spec <code>\${esc(ts.specPath)}</code> todavía no existe. Cuando crees el primer Test del set, se va a generar.</p>\`;
        } else if (ts.tests.length === 0) {
          cardsHtml = \`<p class="empty">El spec existe pero todavía no tiene Tests adentro. Cuando agregues el primero, sus Page Objects van a aparecer acá.</p>\`;
        } else {
          cardsHtml = \`
            <div class="empty" style="text-align:left; max-width: 720px; margin: 0 auto;">
              <p>⚠️ El spec tiene <strong>\${ts.tests.length} Tests</strong> pero no detecté imports de Page Objects.</p>
              <p>El parser busca patrones tipo:</p>
              <pre style="font-size:12px; padding:10px;">import LoginPage from '../pages/LoginPage'
import { LoginPage } from '../pages/LoginPage'
import LoginPage from '../../pages/auth/LoginPage'</pre>
              <p>Si el spec usa un patrón distinto, abrilo y revisá los imports.</p>
              <p style="margin-top: 16px;"><button onclick="abrirVSCode('\${esc(ts.specPath)}', 1)">📂 Abrir spec en VSCode</button></p>
            </div>\`;
        }

        cuerpo = \`
          <div class="panel">
            <h2>\${esc(ts.nombre)} <span style="color:var(--muted);font-weight:400">[testSetId:\${ts.id}]</span></h2>
            <p>\${esc(ts.descripcion || '(sin descripción)')}</p>
            <h3>Spec</h3>
            <p><code>\${esc(ts.specPath)}</code> <button onclick="abrirVSCode('\${esc(ts.specPath)}', 1)">Abrir en VSCode</button></p>
            <h3>Page Objects usados (\${ts.imports.length})</h3>
            \${cardsHtml}
          </div>
        \`;
      } else if (estado.tab === 'tests') {
        if (ts.tests.length === 0) cuerpo = '<div class="panel"><div class="empty">Este Test Set todavía no tiene Tests.</div></div>';
        else cuerpo = \`
          <div class="panel">
            <table>
              <thead><tr><th>Test</th><th>testId</th><th>Pasos</th><th>Canal</th><th></th></tr></thead>
              <tbody>
                \${ts.tests.map((t) => \`
                  <tr onclick="seleccionarTest('\${ts.slug}','\${t.testId}')" style="cursor:pointer">
                    <td>\${esc(t.nombre)}</td>
                    <td><code>\${t.testId}</code></td>
                    <td>\${t.pasos.length || '<span style="color:var(--muted)">sin traza</span>'}</td>
                    <td>\${esc(t.canal || '—')}</td>
                    <td><a href="#" onclick="event.stopPropagation();seleccionarTest('\${ts.slug}','\${t.testId}')">Ver →</a></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } else if (estado.tab === 'ejecuciones') {
        const runsTS = datos.runs.filter((r) => r.testSetSlug === ts.slug);
        cuerpo = renderEjecucionesTabla(runsTS);
      }
      $('main').innerHTML = tabsHtml(tabs) + cuerpo;
    }

    function renderTest() {
      const ts = getTS();
      const t = getTest();
      if (!t) { $('main').innerHTML = '<div class="empty">Test no encontrado.</div>'; return; }

      const tabs = [
        { id: 'detalles', label: 'Detalles' },
        { id: 'pasos', label: \`Pasos (\${t.pasos.length})\` },
        { id: 'grafo', label: 'Grafo' },
        { id: 'ejecuciones', label: 'Ejecuciones' },
      ];
      let cuerpo = '';

      if (estado.tab === 'detalles') {
        cuerpo = \`
          <div class="panel">
            <h2>\${esc(t.nombre)} <span style="color:var(--muted);font-weight:400">[testId:\${t.testId}]</span></h2>
            <p style="color:var(--muted)">Parte de <a href="#" onclick="seleccionarTS('\${ts.slug}');return false">\${esc(ts.nombre)}</a></p>
            <h3>Datos</h3>
            <dl style="display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:13px">
              <dt>Canal</dt><dd>\${esc(t.canal || '—')}</dd>
              <dt>Sesión grabada</dt><dd>\${t.sessionExiste ? '✅' : '❌ (sin session.json)'}</dd>
              <dt>Origen</dt><dd>\${t.almContext ? 'ALM (testId ' + esc(t.almContext.testId) + ')' : 'Manual'}</dd>
            </dl>
            <h3>Acciones</h3>
            <button onclick="abrirVSCode('\${esc(ts.specPath)}', buscarLineaTest('\${esc(t.nombre)}','\${t.testId}'))">Abrir Test en VSCode</button>
          </div>
        \`;
      } else if (estado.tab === 'pasos') {
        if (t.pasos.length === 0) cuerpo = '<div class="panel"><div class="empty">No hay traza para este Test (regrabar para generar <code>{numero}-path.json</code>).</div></div>';
        else cuerpo = '<div class="panel">' + t.pasos.map((p, i) => renderPaso(p, i + 1)).join('') + '</div>';
      } else if (estado.tab === 'grafo') {
        cuerpo = '<div class="panel"><div id="grafoStage"></div></div>';
      } else if (estado.tab === 'ejecuciones') {
        const ids = new Set([t.testId]);
        const runsT = datos.runs.filter((r) =>
          r.testSetSlug === ts.slug && (r.testIds.some((i) => ids.has(i)) || r.tipo === 'testset')
        );
        cuerpo = renderEjecucionesTabla(runsT);
      }
      $('main').innerHTML = tabsHtml(tabs) + cuerpo;

      // Cablear los .paso-row del tab Pasos al modal del Nodo. Usamos data-paso-idx
      // (en lugar de un onclick inline con JSON.stringify anidado) para evitar problemas
      // de escapado cuando el id/selector tiene caracteres especiales.
      if (estado.tab === 'pasos') {
        window.__pasosActuales = t.pasos;
        for (const row of $('main').querySelectorAll('.paso-row[data-paso-idx]')) {
          row.style.cursor = 'pointer';
          row.addEventListener('click', () => {
            const i = parseInt(row.getAttribute('data-paso-idx'), 10);
            if (!Number.isNaN(i) && window.__pasosActuales[i]) {
              abrirNodo(JSON.stringify(window.__pasosActuales[i]));
            }
          });
        }
      }

      if (estado.tab === 'grafo') montarGrafo(t);
    }

    function renderPaso(paso, idx) {
      const n = paso.nodo;
      if (!n) return \`<div class="paso-row"><div class="idx">\${idx}</div><div>(nodo no resuelto: \${esc(paso.id)})</div></div>\`;
      const c = colorPage(n.page);
      const desc = \`<span class="page" style="color:\${c.fg}">\${esc(n.page)}</span> · <span class="accion">\${esc(n.accion)}</span> \${esc(n.selector || '')}\`;
      const conf = n.confiabilidad
        ? \`<span class="conf conf-\${n.confiabilidad}">[\${n.confiabilidad}/5]</span>\`
        : '<span class="conf" style="color:var(--muted)">[—]</span>';
      const dep = n.deprecated ? 'deprecated' : '';
      // El paso se serializa como JSON y se pasa al modal por índice usando
      // window.__pasosActuales (igual que en el grafo). Evita los problemas de
      // escapado del onclick inline cuando el id/selector tiene caracteres especiales.
      return \`
        <div class="paso-row \${dep}" style="border-left-color: \${c.border};" data-paso-idx="\${idx - 1}">
          <div class="idx">\${idx}</div>
          <div class="descripcion">\${desc}</div>
          \${dep ? '<span class="chip warn">deprecated</span>' : ''}
          \${conf}
        </div>
      \`;
    }

    function renderEjecucionesTabla(runs) {
      if (runs.length === 0) return '<div class="panel"><div class="empty">Sin ejecuciones registradas.</div></div>';
      return \`
        <div class="panel">
          <table>
            <thead><tr><th>Cuándo</th><th>Tipo</th><th>Resultado</th><th>Duración</th><th>testIds</th></tr></thead>
            <tbody>
              \${runs.map((r) => \`
                <tr>
                  <td>\${fmtFecha(r.timestamp)}</td>
                  <td>\${r.tipo === 'testset' ? '🚀 Test Set entero' : '▶️ Test puntual'}</td>
                  <td><span class="chip \${r.status === 'passed' ? 'ok' : 'bad'}">\${r.status}</span></td>
                  <td>\${fmtDur(r.duration)}</td>
                  <td>\${r.testIds.length ? r.testIds.map((id) => '<code>' + esc(id) + '</code>').join(' ') : '—'}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      \`;
    }

    function abrirNodo(pasoJsonStr) {
      const paso = JSON.parse(pasoJsonStr);
      const n = paso.nodo;
      if (!n) return;
      const t = getTest();
      const promptActualizar = \`Actualizá el **Nodo** \\\`\${n.id}\\\`. El locator actual es \\\`\${n.selectorRaw}\\\` (confiabilidad \${n.confiabilidad ?? '—'}/5). Decime el nuevo locator y aplicá el cambio en pages/\${n.page}.ts, .autoflow/nodos.json y el sidecar correspondiente, marcando el viejo como deprecated.\`;
      const promptAutoHeal = \`🪄 Auto-Health Node sobre \\\`\${n.id}\\\`. Cargá .autoflow/prompts/auto-health-node.md con nodoId=\${n.id} para que navegues hasta el punto donde se usa, captures el DOM (elemento + 7 ancestros) y propongas un locator más confiable razonando sobre el HTML capturado.\`;
      const promptBifurcar = t
        ? \`Bifurcar **Test** [testId:\${t.testId}] desde el **Nodo** \\\`\${n.id}\\\`. Cargá .autoflow/prompts/bifurcar-caso.md con numeroFuente=\${t.testId} y nodoId=\${n.id} para crear un Test nuevo que reuse el prefix hasta este punto y grabe sólo la cola con codegen + storageState.\`
        : null;
      const ubic = paso.abrir;
      $('modalContent').innerHTML = \`
        <h3>Nodo</h3>
        <dl>
          <dt>id</dt><dd>\${esc(n.id)}</dd>
          <dt>page</dt><dd>\${esc(n.page)}</dd>
          <dt>acción</dt><dd>\${esc(n.accion)}</dd>
          <dt>selector</dt><dd>\${esc(n.selector || '—')}</dd>
          <dt>selectorRaw</dt><dd>\${esc(n.selectorRaw || '—')}</dd>
          <dt>confiabilidad</dt><dd>\${n.confiabilidad ?? '—'}/5</dd>
          \${n.deprecated ? '<dt>deprecated</dt><dd class="bad">true → ' + esc(n.reemplazadoPor || '?') + '</dd>' : ''}
        </dl>
        <div class="acciones" style="flex-wrap:wrap">
          <button onclick="cerrarModal()">Cerrar</button>
          \${ubic ? \`<button onclick="abrirVSCode('\${esc(ubic.archivo)}', \${ubic.line});cerrarModal()">📂 Abrir en VSCode</button>\` : ''}
          \${promptBifurcar ? \`<button onclick="copiar(\${JSON.stringify(promptBifurcar)})">🍴 Bifurcar Test desde acá</button>\` : ''}
          <button onclick="copiar(\${JSON.stringify(promptAutoHeal)})">🪄 Auto-Health (capturar DOM)</button>
          <button class="primary" onclick="copiar(\${JSON.stringify(promptActualizar)})">📋 Copiar prompt: actualizar Nodo</button>
        </div>
      \`;
      $('modal').classList.add('show');
    }
    window.abrirNodo = abrirNodo;
    window.cerrarModal = () => $('modal').classList.remove('show');
    $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.remove('show'); });

    window.abrirVSCode = (relPath, line = 1) => {
      const abs = (datos.rootAbs.replace(/\\/$/,'') + '/' + relPath).replace(/\\\\/g, '/');
      // En Windows queda vscode://file/c:/...; en mac/linux vscode://file//...
      const url = 'vscode://file/' + abs + ':' + line;
      window.location.href = url;
    };

    window.copiar = async (texto) => {
      try {
        await navigator.clipboard.writeText(texto);
        toast('📋 Prompt copiado. Pegalo en el chat de AutoFlow.');
      } catch {
        toast('No pude copiar. Seleccionalo a mano:\\n\\n' + texto);
      }
    };

    window.buscarLineaTest = (nombre, testId) => 1; // placeholder: el spec se abre al inicio

    function toast(msg) {
      const t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--accent);padding:10px 16px;border-radius:6px;z-index:200;white-space:pre-wrap;max-width:400px';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3500);
    }

    async function montarGrafo(test) {
      const stage = $('grafoStage');
      if (!test.pasos.length) {
        stage.outerHTML = '<div class="grafo-vacio">No hay traza para este Test.</div>';
        return;
      }

      // Agrupamos los pasos en bloques contiguos por page. Cada bloque es un subgraph
      // (las pages se ven como cajas con sus pasos adentro flow LR; las cajas fluyen TD).
      const idsLimpios = test.pasos.map((p, i) => ({ ...p, mid: 'n' + i }));
      const bloques = [];
      let bloqueActual = null;
      for (const p of idsLimpios) {
        const pageNombre = p.nodo?.page || '_desconocido_';
        if (!bloqueActual || bloqueActual.page !== pageNombre) {
          bloqueActual = { page: pageNombre, pasos: [], idx: bloques.length };
          bloques.push(bloqueActual);
        }
        bloqueActual.pasos.push(p);
      }

      const lines = ['flowchart TD'];

      // Subgraph por bloque (page). Steps fluyen LR adentro.
      for (const b of bloques) {
        const safeName = b.page.replace(/[^a-zA-Z0-9]/g, '');
        const sgId = \`sg_\${safeName}_\${b.idx}\`;
        lines.push(\`  subgraph \${sgId}["\${b.page} (\${b.pasos.length} \${b.pasos.length === 1 ? 'paso' : 'pasos'})"]\`);
        lines.push('    direction LR');
        for (const p of b.pasos) {
          const n = p.nodo;
          const label = n
            ? \`\${n.accion}<br/>\${(n.selector || '').slice(0, 28)}\`
            : 'desconocido';
          lines.push(\`    \${p.mid}["\${label}"]\`);
          const conf = n?.confiabilidad ?? 0;
          if (n?.deprecated) lines.push(\`    class \${p.mid} dep\`);
          else if (conf <= 1) lines.push(\`    class \${p.mid} c1\`);
          else if (conf === 2) lines.push(\`    class \${p.mid} c2\`);
          else if (conf === 3) lines.push(\`    class \${p.mid} c3\`);
          else if (conf === 4) lines.push(\`    class \${p.mid} c4\`);
          else if (conf === 5) lines.push(\`    class \${p.mid} c5\`);
        }
        // Edges intra-page (LR, secuenciales).
        for (let j = 0; j < b.pasos.length - 1; j++) {
          lines.push(\`    \${b.pasos[j].mid} --> \${b.pasos[j + 1].mid}\`);
        }
        lines.push('  end');
        // Color del subgraph según el hue de la page (semitransparente).
        const info = datos.paginas[b.page];
        const hue = info ? info.hue : Math.abs([...b.page].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 360;
        lines.push(\`  style \${sgId} fill:hsl(\${hue},35%,18%),stroke:hsl(\${hue},65%,55%),stroke-width:2px,color:#e7eaf0\`);
      }

      // Edges inter-page: del último paso de cada bloque al primero del siguiente.
      for (let i = 0; i < bloques.length - 1; i++) {
        const a = bloques[i].pasos[bloques[i].pasos.length - 1];
        const b = bloques[i + 1].pasos[0];
        lines.push(\`  \${a.mid} ==> \${b.mid}\`);
      }

      // Estilos de nodos por confiabilidad.
      lines.push('  classDef dep fill:#444,stroke:#777,color:#bbb,stroke-dasharray:4');
      lines.push('  classDef c1 fill:#3a1a22,stroke:#ff5c7a,color:#ffd');
      lines.push('  classDef c2 fill:#3a2e1a,stroke:#ffb454,color:#ffd');
      lines.push('  classDef c3 fill:#3a371a,stroke:#ffd966,color:#fff');
      lines.push('  classDef c4 fill:#1f3a1a,stroke:#b6e88f,color:#fff');
      lines.push('  classDef c5 fill:#1a3a2a,stroke:#3ddc97,color:#fff');

      // Click handlers — abrir modal del nodo al hacer click.
      for (const p of idsLimpios) {
        lines.push(\`  click \${p.mid} call abrirNodoPorIndice("\${idsLimpios.indexOf(p)}")\`);
      }

      window.__pasosActuales = idsLimpios;
      window.abrirNodoPorIndice = (i) => abrirNodo(JSON.stringify(window.__pasosActuales[+i]));

      const { svg } = await mermaid.render('grafoTest', lines.join('\\n'));
      stage.innerHTML = svg;
      const svgEl = stage.querySelector('svg');
      svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
      svgEl.setAttribute('width', '100%'); svgEl.setAttribute('height', '100%');
      const pz = svgPanZoom(svgEl, { fit: true, center: true, minZoom: 0.1, maxZoom: 20, controlIconsEnabled: true });
      stage.addEventListener('mousedown', () => stage.classList.add('dragging'));
      window.addEventListener('mouseup', () => stage.classList.remove('dragging'));
    }

    function esc(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
    }

    function render() { renderSidebar(); renderMain(); }
    render();
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Auto-reparación de trazas faltantes
// ---------------------------------------------------------------------------
// El dashboard depende de `{numero}-path.json` para mostrar pasos y grafo de
// cada Test. Si el flujo de generar-pom.md saltó el paso de generar la traza,
// el Test queda visible pero sin pasos. Antes de leer el estado, detectamos
// sesiones cerradas (activa: false) cuyo path.json falta pero tienen inputs
// (parsed.json + grupos.json) y disparamos validar-trazas.js para regenerar.

function regenerarTrazasFaltantes() {
  const recDir = '.autoflow/recordings';
  if (!existsSync(recDir)) return;

  const candidatos = [];
  for (const f of readdirSync(recDir)) {
    if (!/-session\.json$/.test(f)) continue;
    const numero = f.replace(/-session\.json$/, '');
    const sess = leerJson(join(recDir, f));
    if (!sess || sess.activa !== false) continue;
    if (existsSync(join(recDir, `${numero}-path.json`))) continue;
    if (
      existsSync(join(recDir, `${numero}-parsed.json`)) &&
      existsSync(join(recDir, `${numero}-grupos.json`))
    ) {
      candidatos.push(numero);
    }
  }
  if (candidatos.length === 0) return;

  console.log(`🔧 Detecté ${candidatos.length} traza(s) faltante(s) — regenerando…`);
  const res = spawnSync('node', ['.autoflow/scripts/validar-trazas.js'], { encoding: 'utf8' });
  const stdout = res.stdout || '';
  const m = stdout.match(/AUTOFLOW_VALIDAR_TRAZAS:\s*(\{.*\})/);
  let resumen = null;
  if (m) {
    try { resumen = JSON.parse(m[1]); } catch {}
  }
  if (resumen?.regenerado?.length > 0) {
    const nums = resumen.regenerado.map((r) => r.numero ?? r).join(', ');
    console.log(`✅ Regeneradas: ${nums}`);
  }
  if (resumen?.fallido?.length > 0) {
    const nums = resumen.fallido.map((r) => r.numero ?? r).join(', ');
    console.log(`⚠ Fallaron: ${nums} — el dashboard las va a mostrar sin pasos hasta que se reparen.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

regenerarTrazasFaltantes();
const modelo = construirModelo();
mkdirSync('.autoflow', { recursive: true });
writeFileSync(OUT, html(modelo), 'utf8');
console.log(`✅ Dashboard generado: ${OUT}`);
console.log(`   ${modelo.testSets.length} Test Sets · ${modelo.testSets.reduce((s, ts) => s + ts.tests.length, 0)} Tests · ${modelo.runs.length} ejecuciones`);

if (process.argv.includes('--open')) {
  const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [OUT], { shell: true, stdio: 'ignore', detached: true }).unref();
}
