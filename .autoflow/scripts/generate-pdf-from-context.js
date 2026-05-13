// Standalone — genera el PDF de un run desde el pdf-context.json que el
// reporter persiste en {runDir}/pdf-context.json al cierre de la corrida.
//
// Lo invocan run-test.js y run-testset.js como proceso separado después de que
// npx playwright test exitea. Correr la generación en un proceso hijo evita
// cualquier conflicto entre chromium.launch (que arma el PDF) y los workers
// internos de Playwright (que arman los tests) en el mismo proceso.
//
// Uso: node .autoflow/scripts/generate-pdf-from-context.js <runDir>
//
// Output: imprime AUTOFLOW_PDF: { ok, path?, reason? }. Si el pdf-context.json
// no existe (corrida sin reporter, ej: alguien usó otra config), exitea ok=false
// silenciosa sin romper.

const { existsSync, readFileSync } = require('node:fs');
const { join, isAbsolute } = require('node:path');

const runDirArg = process.argv[2];
if (!runDirArg) {
  console.error('Uso: node .autoflow/scripts/generate-pdf-from-context.js <runDir>');
  process.exit(2);
}

const runDir = isAbsolute(runDirArg) ? runDirArg : runDirArg;
const ctxPath = join(runDir, 'pdf-context.json');

if (!existsSync(ctxPath)) {
  console.log(`AUTOFLOW_PDF: ${JSON.stringify({ ok: false, reason: 'no_context', ctxPath })}`);
  process.exit(0);
}

(async () => {
  let ctx;
  try {
    ctx = JSON.parse(readFileSync(ctxPath, 'utf8'));
  } catch (err) {
    console.log(`AUTOFLOW_PDF: ${JSON.stringify({ ok: false, reason: 'invalid_context', error: String(err?.message ?? err) })}`);
    process.exit(0);
  }

  // Si el PDF ya existe (el reporter alcanzó a generarlo inline), no hacemos nada.
  if (ctx.expectedPdfPath && existsSync(ctx.expectedPdfPath)) {
    console.log(`AUTOFLOW_PDF: ${JSON.stringify({ ok: true, path: ctx.expectedPdfPath, source: 'preexisting' })}`);
    return;
  }

  try {
    const { generatePdfReport } = require('./lib/pdf-report');
    const outPath = await generatePdfReport(ctx);
    console.log(`AUTOFLOW_PDF: ${JSON.stringify({ ok: true, path: outPath, source: 'standalone' })}`);
  } catch (err) {
    console.error(`⚠ generate-pdf-from-context: ${err?.message ?? err}`);
    if (err?.stack) console.error(err.stack);
    console.log(`AUTOFLOW_PDF: ${JSON.stringify({ ok: false, reason: 'render_error', error: String(err?.message ?? err) })}`);
    // exit 0 igual — el wrapper sigue con su flujo.
  }
})();
