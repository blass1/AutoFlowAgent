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
const { spawn } = require('node:child_process');

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
  if (!existsSync(specPath)) return null;
  const src = readFileSync(specPath, 'utf8');
  const describe = src.match(/test\.describe\(\s*['"`](.+?)\s*\[testSetId:(\d+)\]\s*['"`]/);
  const tests = [];
  const re = /test\(\s*['"`](.+?)\s*\[testId:(\d+)\]\s*['"`]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    tests.push({ nombre: m[1].trim(), testId: m[2] });
  }
  // Imports de pages para mapear a archivos:
  const imports = [];
  const reImp = /import\s+(\w+)\s+from\s+['"`]\.\.\/(pages\/[\w/]+)['"`]/g;
  while ((m = reImp.exec(src)) !== null) {
    imports.push({ nombreClase: m[1], rutaSinExt: m[2] });
  }
  return {
    describe: describe ? { nombre: describe[1].trim(), testSetId: describe[2] } : null,
    tests,
    imports,
  };
}

// Para cada Page Object intentamos sacar las líneas donde se asignan los locators
// (constructor: `this.x = page.{selectorRaw}`). Best-effort, todo en regex.
function indexarPaginas() {
  const out = {};
  for (const p of listarTs('pages')) {
    const src = readFileSync(p, 'utf8');
    const lines = src.split('\n');
    const claseMatch = src.match(/export\s+default\s+class\s+(\w+)/);
    if (!claseMatch) continue;
    const clase = claseMatch[1];
    const locators = []; // { selectorRaw, line }
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/=\s*(?:this\.)?page\.(.+?);?\s*$/);
      if (m) locators.push({ selectorRaw: m[1].trim().replace(/;$/, ''), line: i + 1 });
    }
    out[clase] = { archivo: p, locators };
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

  // Por cada Test Set, parseamos el spec y armamos los Tests con sus pasos (traza).
  const testSets = sets.map((set) => {
    const parsed = set.specPath ? parsearSpec(set.specPath) : null;
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
      return {
        testId: t.testId,
        nombre: t.nombre,
        pasos,
        sessionExiste: !!session,
        almContext: session?.almContext ?? null,
        canal: session?.canal ?? null,
      };
    });
    return {
      slug: set.slug,
      id: set.id,
      nombre: set.nombre,
      descripcion: set.descripcion ?? '',
      specPath: set.specPath,
      describe: parsed?.describe ?? null,
      imports: parsed?.imports ?? [],
      tests,
    };
  });

  // Resolución absoluta de archivos para vscode://file/.
  const absPath = (rel) => resolve(ROOT, rel).replace(/\\/g, '/');

  return {
    generadoEn: new Date().toISOString(),
    proyecto: relative(resolve(ROOT, '..'), ROOT) || ROOT.split(sep).pop(),
    rootAbs: absPath('.'),
    testSets,
    runs,
    nodos,
    sidecars,
    paginas: Object.fromEntries(
      Object.entries(paginas).map(([k, v]) => [k, { archivo: v.archivo, archivoAbs: absPath(v.archivo) }])
    ),
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
    --bg: #0f1115;
    --panel: #161a22;
    --panel2: #1c2230;
    --text: #e7eaf0;
    --muted: #97a0b3;
    --accent: #4f8cff;
    --ok: #3ddc97;
    --bad: #ff5c7a;
    --warn: #ffb454;
    --border: #262b36;
    --chip: #232938;
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
    border-bottom: 1px solid var(--border); background: var(--panel);
    position: sticky; top: 0; z-index: 10;
  }
  header h1 { margin: 0; font-size: 15px; font-weight: 600; }
  header .meta { color: var(--muted); font-size: 12px; }
  header .toolbar { margin-left: auto; display: flex; gap: 6px; }

  .layout { display: grid; grid-template-columns: 320px 1fr; height: calc(100vh - 50px); }
  aside { border-right: 1px solid var(--border); overflow: auto; background: var(--panel); }
  aside h2 { font-size: 11px; text-transform: uppercase; color: var(--muted); margin: 16px 12px 6px; letter-spacing: 0.06em; }
  .ts-row { padding: 6px 12px; cursor: pointer; border-left: 3px solid transparent; }
  .ts-row:hover { background: var(--panel2); }
  .ts-row.active { background: var(--panel2); border-left-color: var(--accent); }
  .ts-row .nombre { font-weight: 600; }
  .ts-row .meta-line { color: var(--muted); font-size: 11px; margin-top: 2px; }
  .t-row { padding: 5px 12px 5px 28px; cursor: pointer; font-size: 13px; }
  .t-row:hover { background: var(--panel2); }
  .t-row.active { background: var(--panel2); color: var(--accent); }

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
    border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; cursor: pointer; align-items: center; }
  .paso-row:hover { border-color: var(--accent); }
  .paso-row.deprecated { opacity: 0.5; }
  .paso-row .idx { color: var(--muted); font-family: monospace; }
  .paso-row .descripcion { font-family: monospace; font-size: 12px; }
  .paso-row .descripcion .page { color: var(--accent); }
  .paso-row .descripcion .accion { color: var(--warn); }
  .paso-row .conf { font-family: monospace; font-size: 11px; }

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
    import svgPanZoom from 'https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/+esm';

    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: { htmlLabels: true, useMaxWidth: false, curve: 'basis' },
    });

    const datos = JSON.parse(document.getElementById('datos').textContent);
    const $ = (id) => document.getElementById(id);
    let estado = { tsSlug: null, testId: null, tab: 'detalles' };

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
      const html = ['<h2>Test Sets</h2>'];
      if (datos.testSets.length === 0) {
        html.push('<div class="empty">No hay Test Sets todavía.</div>');
      } else {
        for (const ts of datos.testSets) {
          const active = estado.tsSlug === ts.slug && !estado.testId ? 'active' : '';
          html.push(\`
            <div class="ts-row \${active}" onclick="seleccionarTS('\${ts.slug}')">
              <div class="nombre">\${esc(ts.nombre)}</div>
              <div class="meta-line">[testSetId:\${ts.id}] · \${ts.tests.length} Tests</div>
            </div>
          \`);
          if (estado.tsSlug === ts.slug) {
            for (const t of ts.tests) {
              const a2 = estado.testId === t.testId ? 'active' : '';
              html.push(\`
                <div class="t-row \${a2}" onclick="seleccionarTest('\${ts.slug}','\${t.testId}')">
                  ▸ \${esc(t.nombre)} <span style="color:var(--muted)">[\${t.testId}]</span>
                </div>
              \`);
            }
          }
        }
      }
      $('sidebar').innerHTML = html.join('');
    }

    function seleccionarTS(slug) {
      estado = { tsSlug: slug, testId: null, tab: 'detalles' };
      render();
    }
    function seleccionarTest(slug, testId) {
      estado = { tsSlug: slug, testId, tab: 'detalles' };
      render();
    }
    function elegirTab(tab) { estado.tab = tab; renderMain(); }

    window.seleccionarTS = seleccionarTS;
    window.seleccionarTest = seleccionarTest;
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
      if (!estado.tsSlug) {
        $('main').innerHTML = '<div class="empty">Elegí un Test Set o un Test del panel izquierdo.</div>';
        return;
      }

      if (!estado.testId) {
        renderTestSet();
        return;
      }
      renderTest();
    }

    function renderTestSet() {
      const ts = getTS();
      const tabs = [
        { id: 'detalles', label: 'Detalles' },
        { id: 'tests', label: \`Tests (\${ts.tests.length})\` },
        { id: 'ejecuciones', label: 'Ejecuciones' },
      ];
      let cuerpo = '';
      if (estado.tab === 'detalles') {
        cuerpo = \`
          <div class="panel">
            <h2>\${esc(ts.nombre)} <span style="color:var(--muted);font-weight:400">[testSetId:\${ts.id}]</span></h2>
            <p>\${esc(ts.descripcion || '(sin descripción)')}</p>
            <h3>Spec</h3>
            <p><code>\${esc(ts.specPath)}</code> <button onclick="abrirVSCode('\${esc(ts.specPath)}', 1)">Abrir en VSCode</button></p>
            <h3>Page Objects usados</h3>
            \${ts.imports.length === 0
              ? '<p class="empty">Ninguno todavía.</p>'
              : '<ul>' + ts.imports.map((i) =>
                  \`<li><code>\${esc(i.nombreClase)}</code> — <code>\${esc(i.rutaSinExt)}.ts</code>
                   <button onclick="abrirVSCode('\${esc(i.rutaSinExt)}.ts', 1)">Abrir</button></li>\`
                ).join('') + '</ul>'}
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

      if (estado.tab === 'grafo') montarGrafo(t);
    }

    function renderPaso(paso, idx) {
      const n = paso.nodo;
      if (!n) return \`<div class="paso-row"><div class="idx">\${idx}</div><div>(nodo no resuelto: \${esc(paso.id)})</div></div>\`;
      const desc = \`<span class="page">\${esc(n.page)}</span> · <span class="accion">\${esc(n.accion)}</span> \${esc(n.selector || '')}\`;
      const conf = n.confiabilidad
        ? \`<span class="conf conf-\${n.confiabilidad}">[\${n.confiabilidad}/5]</span>\`
        : '<span class="conf" style="color:var(--muted)">[—]</span>';
      const dep = n.deprecated ? 'deprecated' : '';
      return \`
        <div class="paso-row \${dep}" onclick='abrirNodo(\${JSON.stringify(JSON.stringify(paso))})'>
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
      const promptCopiar = \`Actualizá el **Nodo** \\\`\${n.id}\\\`. El locator actual es \\\`\${n.selectorRaw}\\\` (confiabilidad \${n.confiabilidad ?? '—'}/5). Decime el nuevo locator y aplicá el cambio en pages/\${n.page}.ts, .autoflow/nodos.json y el sidecar correspondiente, marcando el viejo como deprecated.\`;
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
        <div class="acciones">
          <button onclick="cerrarModal()">Cerrar</button>
          \${ubic ? \`<button onclick="abrirVSCode('\${esc(ubic.archivo)}', \${ubic.line});cerrarModal()">📂 Abrir en VSCode</button>\` : ''}
          <button class="primary" onclick="copiar(\${JSON.stringify(promptCopiar)})">📋 Copiar prompt</button>
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
      // Armamos un mermaid simple del paso a paso, agrupando nodos contiguos por page.
      const lines = ['flowchart TD'];
      const idsLimpios = test.pasos.map((p, i) => ({ ...p, mid: 'n' + i }));
      let prev = null;
      for (const p of idsLimpios) {
        const n = p.nodo;
        const label = n
          ? \`\${n.page}<br/>\${n.accion} \${(n.selector || '').slice(0, 30)}\`
          : 'desconocido';
        const conf = n?.confiabilidad ?? 0;
        lines.push(\`  \${p.mid}["\${label}"]\`);
        if (n?.deprecated) lines.push(\`  class \${p.mid} dep\`);
        else if (conf <= 1) lines.push(\`  class \${p.mid} c1\`);
        else if (conf === 2) lines.push(\`  class \${p.mid} c2\`);
        else if (conf === 3) lines.push(\`  class \${p.mid} c3\`);
        else if (conf === 4) lines.push(\`  class \${p.mid} c4\`);
        else if (conf === 5) lines.push(\`  class \${p.mid} c5\`);
        if (prev) lines.push(\`  \${prev.mid} --> \${p.mid}\`);
        prev = p;
      }
      lines.push('  classDef dep fill:#444,stroke:#777,color:#bbb,stroke-dasharray:4');
      lines.push('  classDef c1 fill:#3a1a22,stroke:#ff5c7a,color:#ffd');
      lines.push('  classDef c2 fill:#3a2e1a,stroke:#ffb454,color:#ffd');
      lines.push('  classDef c3 fill:#3a371a,stroke:#ffd966,color:#fff');
      lines.push('  classDef c4 fill:#1f3a1a,stroke:#b6e88f,color:#fff');
      lines.push('  classDef c5 fill:#1a3a2a,stroke:#3ddc97,color:#fff');

      // Click handlers en mermaid via la directiva click → función JS global.
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
// Main
// ---------------------------------------------------------------------------

const modelo = construirModelo();
mkdirSync('.autoflow', { recursive: true });
writeFileSync(OUT, html(modelo), 'utf8');
console.log(`✅ Dashboard generado: ${OUT}`);
console.log(`   ${modelo.testSets.length} Test Sets · ${modelo.testSets.reduce((s, ts) => s + ts.tests.length, 0)} Tests · ${modelo.runs.length} ejecuciones`);

if (process.argv.includes('--open')) {
  const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [OUT], { shell: true, stdio: 'ignore', detached: true }).unref();
}
