// Genera un PDF de reporte por corrida. Lo invoca el reporter custom de Playwright
// (lib/run-reporter.js) en onEnd(), después de que todos los tests terminaron.
//
// Modos:
//   - mode === 'test'    → un solo test corrido. Filename: {testId}.pdf
//   - mode === 'testset' → múltiples tests (testset completo). Filename: {slug}.pdf,
//                          una sección por test con su evidencia.
//
// Estrategia de render: HTML/CSS inline → Playwright (chromium) → page.pdf(). Las
// imágenes van como data: URIs (base64) embebidas para que el PDF sea autocontenido.

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
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
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
  const executorLine = formatExecutor(executor);
  const testSetLine = testSet ? `${esc(testSet.nombre)} [testSetId:${esc(testSet.id)}]` : '—';

  let bodyContent;
  if (mode === 'testset') {
    bodyContent = tests.map(t => buildTestSection(t)).join('');
  } else {
    const t = tests[0];
    bodyContent = t ? buildEvidenceSection(t.screens || []) : '<p class="empty">Sin datos.</p>';
  }

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 0; margin: 0; color: #2a2a2a; }
  .page { padding: 30px 25px; }
  h1 { color: #2a2168; margin: 0 0 8px; font-size: 24px; border-bottom: 3px solid #ff6f1d; padding-bottom: 8px; }
  h2 { color: #2a2168; margin: 28px 0 10px; font-size: 18px; border-bottom: 2px solid #ff6f1d; padding-bottom: 4px; }
  h3 { color: #4d3a8a; margin: 18px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta { background: #f5f3fb; border-left: 4px solid #ff6f1d; padding: 14px 16px; margin: 12px 0 22px; border-radius: 4px; }
  .meta dl { display: grid; grid-template-columns: 140px 1fr; gap: 5px 12px; margin: 0; font-size: 12px; }
  .meta dt { font-weight: 600; color: #555; }
  .meta dd { margin: 0; color: #222; word-break: break-word; }
  .status-passed { color: #2e7d32; font-weight: 700; }
  .status-failed { color: #c62828; font-weight: 700; }
  .test-section { page-break-before: always; }
  .test-section:first-of-type { page-break-before: auto; }
  .evidencia { page-break-inside: avoid; margin: 14px 0; }
  .evidencia img { max-width: 100%; max-height: 700px; border: 1px solid #ccc; display: block; }
  .evidencia .caption { font-size: 9px; color: #666; margin-top: 3px; font-family: monospace; word-break: break-all; }
  .empty { color: #999; font-style: italic; padding: 8px 0; font-size: 12px; }
  footer { font-size: 9px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 8px; }
</style>
</head><body>
<div class="page">
  <h1>Reporte de ejecución — ${esc(reportTitle)}</h1>
  <div class="meta"><dl>
    ${mode === 'testset' ? `<dt>Test Set</dt><dd>${testSetLine}</dd>` : ''}
    <dt>Status</dt><dd class="status-${statusClass}">${statusText}</dd>
    <dt>Duración</dt><dd>${fmtDur(duration)}</dd>
    <dt>Fecha</dt><dd>${esc(fmtDate(date))}</dd>
    <dt>Ejecutor</dt><dd>${executorLine}</dd>
    <dt>Canal</dt><dd>${esc(canal || '—')}</dd>
    <dt>URL inicial</dt><dd>${esc(urlInicial || '—')}</dd>
    ${mode === 'test' && testSet ? `<dt>Test Set</dt><dd>${testSetLine}</dd>` : ''}
  </dl></div>
  ${bodyContent}
  <footer>Generado por AutoFlow · ${esc(fmtDate(new Date().toISOString()))}</footer>
</div>
</body></html>`;
}

function buildTestSection(t) {
  const statusClass = t.status === 'passed' ? 'passed' : 'failed';
  return `<div class="test-section">
    <h2>Test ${esc(t.testId || '—')} — ${esc(t.name || '—')}</h2>
    <div class="meta"><dl>
      <dt>Status</dt><dd class="status-${statusClass}">${(t.status || 'unknown').toUpperCase()}</dd>
      <dt>Duración</dt><dd>${fmtDur(t.duration || 0)}</dd>
    </dl></div>
    <h3>Evidencia</h3>
    ${buildEvidenceSection(t.screens || [])}
  </div>`;
}

function buildEvidenceSection(screens) {
  if (!screens.length) {
    return '<p class="empty">No hay screenshots para este test.</p>';
  }
  return '<h3>Evidencia</h3>' + screens.map(screenPath => {
    let dataUri = '';
    try {
      const buf = readFileSync(screenPath);
      dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch {
      // Si falla la lectura, mostramos un placeholder.
    }
    const filename = screenPath.split(/[/\\]/).pop();
    return `<div class="evidencia">
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

function formatExecutor(executor) {
  if (!executor || !executor.nombre) return '—';
  const partes = [esc(executor.nombre)];
  if (executor.legajo) partes.push(`(legajo ${esc(executor.legajo)})`);
  const trib = [executor.equipo, executor.tribu].filter(Boolean).map(esc).join(' / ');
  if (trib) partes.push(`· ${trib}`);
  return partes.join(' ');
}

module.exports = { generatePdfReport };
