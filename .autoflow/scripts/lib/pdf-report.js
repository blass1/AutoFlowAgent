// Genera un PDF de reporte por corrida. Lo invoca el reporter custom de Playwright
// (lib/run-reporter.js) en onEnd(), después de que todos los tests terminaron.
//
// Modos:
//   - mode === 'test'    → un solo test corrido. Filename: {testId}.pdf
//   - mode === 'testset' → múltiples tests (testset completo). Filename: {slug}.pdf,
//                          con sección y evidencia por cada test.
//
// Estrategia de render: HTML/CSS inline → Playwright (chromium) → page.pdf(). Las
// imágenes van como data: URIs (base64) embebidas para que el PDF sea autocontenido.
//
// Diseño visual (paleta Galicia):
//   - Background gradient en cada página: naranja arriba → violeta intermedio → indigo abajo.
//   - Texto cream/off-white, cards semitransparentes oscuras para legibilidad.
//   - `print-color-adjust: exact` para que el gradient y los colores se preserven.
//   - Página 1 (portada): datos del ejecutor + ejecución + ambiente — pensada para que un QA
//     que la adjunte a ALM tenga toda la metadata visible de un vistazo.
//   - Páginas siguientes: evidencia (screens) con captions.

const { chromium } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

async function generatePdfReport(opts) {
  const { runDir, reportName } = opts;
  if (!runDir || !reportName) {
    throw new Error('pdf-report: faltan runDir o reportName');
  }

  const html = buildHtml(opts);
  const outputPath = join(runDir, `${reportName}.pdf`);

  const browser = await chromium.launch({ headless: true });
  try {
    // Viewport ~= A4 a 96 DPI (210mm × 297mm). Que el browser y el PDF coincidan
    // en dimensiones evita que el contenido se rompa entre hojas por mismatch
    // entre tamaño de viewport y formato del PDF.
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
  } finally {
    await browser.close().catch(() => {});
  }

  return outputPath;
}

// ---------- HTML / CSS template ----------

function buildHtml(opts) {
  const {
    mode = 'test',
    reportTitle,
    status,
    duration,
    date,
    executor,
    canal,
    urlInicial,
    testSet,
    tests = [],
  } = opts;

  const statusClass = status === 'passed' ? 'passed' : 'failed';
  const statusText = (status || 'unknown').toUpperCase();

  // ID principal — testId si es modo test, testSetId si es testset.
  let mainId, subtitle;
  if (mode === 'testset') {
    mainId = testSet ? `testSetId: ${testSet.id ?? '—'}` : '—';
    subtitle = `Test Set · ${tests.length} test${tests.length !== 1 ? 's' : ''}`;
  } else {
    const t = tests[0];
    mainId = t?.testId ? `testId: ${t.testId}` : '—';
    subtitle = testSet ? `${testSet.nombre} · testSetId: ${testSet.id ?? '—'}` : 'Test individual';
  }

  // Bloques de evidencia: en modo test, un solo bloque sin sub-portada. En testset,
  // una sección por test con su mini-header (status + duración).
  let evidenceBlock;
  if (mode === 'testset') {
    evidenceBlock = tests.map(t => buildTestSection(t)).join('');
  } else {
    const t = tests[0];
    evidenceBlock = t ? buildEvidencePage(t.screens || [], t.name, t.testId) : '';
  }

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<style>
  :root {
    --accent: #ff6f1d;
    --accent2: #4d3a8a;
    --indigo: #2a2168;
    --text: #f3f0e7;
    --muted: rgba(243, 240, 231, 0.78);
    --ok: #3ddc97;
    --bad: #ff5c7a;
    --card-bg: rgba(13, 13, 26, 0.62);
    --card-border: rgba(243, 240, 231, 0.22);
    --card-inner-border: rgba(243, 240, 231, 0.12);
  }
  /* @page A4 sin márgenes — el padding lo maneja .pdf-page para que el gradient
     llegue al borde del papel. preferCSSPageSize=true en page.pdf() respeta esto. */
  @page {
    size: A4;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  html, body {
    margin: 0;
    padding: 0;
    color: var(--text);
    font-family: 'Segoe UI', -apple-system, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
  }
  /* .pdf-page por default ocupa AL MENOS una hoja A4 (210mm x 297mm) pero
     puede crecer si el contenido la supera — usado en las páginas de evidencia
     donde varios screens fluyen a páginas siguientes naturalmente. El gradient
     se estira sobre toda la altura del div: si la página ocupa 2 A4, el
     gradient queda partido (top page muestra la mitad superior orange-violeta,
     bottom page muestra la mitad inferior violeta-indigo) lo cual es visualmente
     coherente y se siente continuo entre páginas.
     Para la portada hay un override .pdf-cover que fija altura exacta + overflow
     hidden — el cover debe llenar UNA sola A4 sin recortar nada relevante. */
  .pdf-page {
    background: linear-gradient(180deg, var(--accent) 0%, var(--accent2) 52%, var(--indigo) 100%);
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 14mm 12mm;
    page-break-after: always;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .pdf-page:last-child { page-break-after: auto; }
  /* Override para la portada: altura A4 exacta + overflow hidden. Su contenido
     está calibrado para entrar en una sola hoja. */
  .pdf-cover {
    height: 297mm;
    min-height: 297mm;
    overflow: hidden;
  }

  /* Brand header chiquito en cada página */
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 16px;
    border-bottom: 1.5px solid rgba(243, 240, 231, 0.28);
    margin-bottom: 28px;
  }
  .brand .logo {
    font-size: 24px;
    line-height: 1;
  }
  .brand .title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.92;
  }

  /* ---------- Portada (página 1) ---------- */
  .cover-title {
    font-size: 34px;
    font-weight: 700;
    margin: 0 0 8px;
    line-height: 1.12;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.32);
  }
  .cover-subtitle {
    font-size: 14px;
    opacity: 0.88;
    margin-bottom: 28px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }
  .status-badge {
    display: inline-block;
    padding: 11px 24px;
    border-radius: 999px;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin-bottom: 32px;
    background: var(--card-bg);
    border: 2px solid var(--card-border);
  }
  .status-badge.passed { color: var(--ok); border-color: rgba(61, 220, 151, 0.58); }
  .status-badge.failed { color: var(--bad); border-color: rgba(255, 92, 122, 0.58); }

  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    margin-bottom: 20px;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 22px 24px;
  }
  .card.wide { grid-column: 1 / -1; }
  .card h2 {
    margin: 0 0 14px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--accent);
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card dl {
    margin: 0;
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 9px 14px;
    font-size: 13px;
  }
  .card.wide dl { grid-template-columns: 120px 1fr; }
  .card dt {
    color: var(--muted);
    font-weight: 500;
  }
  .card dd {
    margin: 0;
    color: var(--text);
    font-weight: 600;
    word-break: break-word;
  }

  /* ---------- Card "Páginas": flow de pages traversadas (modo test individual) ---------- */
  .pages-flow {
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .pages-flow .page-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--card-inner-border);
    background: rgba(13, 13, 26, 0.42);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .pages-flow .page-pill.passed {
    border-color: rgba(61, 220, 151, 0.55);
    color: var(--ok);
  }
  .pages-flow .page-pill.failed {
    border-color: rgba(255, 92, 122, 0.6);
    color: var(--bad);
    background: rgba(120, 22, 36, 0.32);
  }
  .pages-flow .page-pill .icon {
    font-weight: 700;
    font-size: 13px;
  }
  .pages-flow .arrow {
    opacity: 0.55;
    font-size: 14px;
  }
  .pages-flow .empty {
    font-style: italic;
    color: var(--muted);
    font-size: 12px;
  }

  /* ---------- Tests del Test Set (modo testset, en página de portada) ---------- */
  .tests-summary {
    margin-top: 4px;
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .tests-summary li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: rgba(13, 13, 26, 0.42);
    border: 1px solid var(--card-inner-border);
    border-radius: 8px;
    font-size: 13px;
  }
  .tests-summary .test-id {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11px;
    opacity: 0.72;
    min-width: 70px;
  }
  .tests-summary .test-name { flex: 1; font-weight: 600; }
  .tests-summary .test-pill {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .tests-summary .test-pill.passed { color: var(--ok); background: rgba(61, 220, 151, 0.14); }
  .tests-summary .test-pill.failed { color: var(--bad); background: rgba(255, 92, 122, 0.14); }

  /* ---------- Páginas de evidencia ---------- */
  .evidence-title {
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .evidence-subtitle {
    font-size: 12px;
    opacity: 0.82;
    margin-bottom: 22px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }
  .test-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 6px;
  }
  .test-header h2 {
    margin: 0;
    font-size: 22px;
    flex: 1;
  }
  .test-header .test-status {
    padding: 5px 14px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
    background: var(--card-bg);
    border: 1.5px solid var(--card-border);
  }
  .test-header .test-status.passed { color: var(--ok); border-color: rgba(61, 220, 151, 0.55); }
  .test-header .test-status.failed { color: var(--bad); border-color: rgba(255, 92, 122, 0.55); }
  .test-meta {
    font-size: 11px;
    opacity: 0.75;
    margin-bottom: 22px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }
  .screen {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    padding: 10mm 12mm;
    margin: 0 auto 6mm;
    max-width: 165mm;
    page-break-inside: avoid;
  }
  .screen img {
    max-width: 100%;
    max-height: 78mm;
    border-radius: 6px;
    display: block;
    margin: 0 auto;
    border: 1px solid var(--card-inner-border);
    object-fit: contain;
  }
  .screen .caption {
    font-size: 8.5pt;
    color: var(--muted);
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    margin-top: 6mm;
    text-align: center;
    word-break: break-all;
  }
  .empty {
    color: var(--muted);
    font-style: italic;
    padding: 14px 0;
    font-size: 13px;
    text-align: center;
  }

  /* Footer en cada página */
  .pdf-footer {
    margin-top: auto;
    padding-top: 18px;
    border-top: 1px solid rgba(243, 240, 231, 0.22);
    font-size: 10px;
    opacity: 0.72;
    text-align: center;
    letter-spacing: 0.02em;
  }
</style>
</head><body>

<!-- ============ Página 1 — Portada ============ -->
<div class="pdf-page pdf-cover">
  <div class="brand">
    <span class="logo">🌊</span>
    <span class="title">AutoFlow · Reporte de Ejecución</span>
  </div>

  <h1 class="cover-title">${esc(reportTitle)}</h1>
  <div class="cover-subtitle">${esc(subtitle)} · ${esc(mainId)}</div>

  <div class="status-badge ${statusClass}">${statusText}</div>

  <div class="cards">
    <div class="card">
      <h2>👤 Ejecutado por</h2>
      <dl>
        <dt>Nombre</dt><dd>${esc(executor?.nombre || '—')}</dd>
        <dt>Legajo</dt><dd>${esc(executor?.legajo || '—')}</dd>
        <dt>Equipo</dt><dd>${esc(executor?.equipo || '—')}</dd>
        <dt>Tribu</dt><dd>${esc(executor?.tribu || '—')}</dd>
      </dl>
    </div>

    <div class="card">
      <h2>⚙️ Ejecución</h2>
      <dl>
        <dt>Fecha</dt><dd>${esc(fmtDate(date))}</dd>
        <dt>Duración</dt><dd>${fmtDur(duration)}</dd>
        ${mode === 'testset'
          ? `<dt>Tests</dt><dd>${tests.length} (${tests.filter(t => t.status === 'passed').length} OK · ${tests.filter(t => t.status !== 'passed').length} fallados)</dd>`
          : `<dt>Test ID</dt><dd>${esc(tests[0]?.testId || '—')}</dd>`}
        <dt>Test Set</dt><dd>${testSet ? `${esc(testSet.nombre)} <span style="opacity:.6">[${esc(testSet.id)}]</span>` : '—'}</dd>
      </dl>
    </div>

    <div class="card wide">
      <h2>🌐 Ambiente</h2>
      <dl>
        <dt>Canal</dt><dd>${esc(canal || '—')}</dd>
        <dt>URL inicial</dt><dd>${esc(urlInicial || '—')}</dd>
      </dl>
    </div>

    ${mode === 'test' ? buildPagesCard(tests[0]?.pages || []) : ''}

    ${mode === 'testset' && tests.length > 0 ? `
    <div class="card wide">
      <h2>📋 Tests incluidos</h2>
      <ul class="tests-summary">
        ${tests.map(t => `
          <li>
            <span class="test-id">[${esc(t.testId || '—')}]</span>
            <span class="test-name">${esc(t.name || '—')}</span>
            <span class="test-pill ${t.status === 'passed' ? 'passed' : 'failed'}">${(t.status || 'unknown').toUpperCase()}</span>
          </li>
        `).join('')}
      </ul>
    </div>
    ` : ''}
  </div>

  <div class="pdf-footer">Generado por AutoFlow · ${esc(fmtDate(new Date().toISOString()))} · Reporte para ALM</div>
</div>

<!-- ============ Páginas 2+ — Evidencia ============ -->
${evidenceBlock}

</body></html>`;
}

function buildTestSection(t) {
  const statusClass = t.status === 'passed' ? 'passed' : 'failed';
  return `<div class="pdf-page">
    <div class="brand">
      <span class="logo">🌊</span>
      <span class="title">AutoFlow · Evidencia</span>
    </div>
    <div class="test-header">
      <h2>${esc(t.name || 'Test')}</h2>
      <span class="test-status ${statusClass}">${(t.status || 'unknown').toUpperCase()}</span>
    </div>
    <div class="test-meta">testId: ${esc(t.testId || '—')} · duración: ${fmtDur(t.duration || 0)}</div>
    ${buildScreensList(t.screens || [])}
    <div class="pdf-footer">Generado por AutoFlow · Test ${esc(t.testId || '—')}</div>
  </div>`;
}

function buildEvidencePage(screens, testName, testId) {
  return `<div class="pdf-page">
    <div class="brand">
      <span class="logo">🌊</span>
      <span class="title">AutoFlow · Evidencia</span>
    </div>
    <h1 class="evidence-title">Evidencia</h1>
    <div class="evidence-subtitle">${esc(testName || 'Test')} · testId: ${esc(testId || '—')}</div>
    ${buildScreensList(screens)}
    <div class="pdf-footer">Generado por AutoFlow · Test ${esc(testId || '—')}</div>
  </div>`;
}

/**
 * Card "Páginas": secuencia de pages que recorrió el test con ✓ por cada una que
 * pasó y ✗ en la que se rompió (si falló). Solo se renderiza en modo `test`
 * individual — en `testset` cada test tiene su propia secuencia y la card no escala.
 *
 * Recibe `pages: [{ name, status: 'passed' | 'failed' }]` ya computado por
 * `run-reporter.js → computePagesForTest()`. Si está vacío (no hay path.json o el
 * test no tiene nodos resolubles), no rendereamos el card para no mostrar info engañosa.
 */
function buildPagesCard(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return '';

  const pills = pages.map((p, i) => {
    const icon = p.status === 'failed' ? '✗' : '✓';
    const cls = p.status === 'failed' ? 'failed' : 'passed';
    const arrow = i < pages.length - 1 ? '<span class="arrow">→</span>' : '';
    return `<span class="page-pill ${cls}"><span class="icon">${icon}</span>${esc(p.name)}</span>${arrow}`;
  }).join('');

  return `
    <div class="card wide">
      <h2>📄 Páginas</h2>
      <div class="pages-flow">${pills}</div>
    </div>`;
}

function buildScreensList(screens) {
  if (!screens.length) {
    return '<p class="empty">No hay screenshots capturados para este test.</p>';
  }
  return screens.map(screenPath => {
    let dataUri = '';
    try {
      const buf = readFileSync(screenPath);
      dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      // si falla la lectura, mostramos placeholder
    }
    const filename = screenPath.split(/[/\\]/).pop();
    return `<div class="screen">
      ${dataUri ? `<img src="${dataUri}" alt="${esc(filename)}">` : '<p class="empty">Imagen no disponible.</p>'}
      <div class="caption">${esc(filename)}</div>
    </div>`;
  }).join('');
}

// ---------- helpers de formato ----------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDur(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

module.exports = { generatePdfReport };
