// Reporter de Playwright que centraliza 3 responsabilidades post-run:
//   1. Persistir el run JSON en `.autoflow/runs/{id}.json` (solo si NO vino de
//      un wrapper — el wrapper ya escribe su entry con más contexto). Esto cubre
//      el caso de `npx playwright test ...` directo / plugin de VSCode.
//   2. Generar el reporte PDF en `{runDir}/{name}.pdf` con todas las evidencias
//      (screenshots tomados por la fixture `screen()` durante el test). Siempre
//      corre, sin importar el wrapper.
//   3. Escribir el ResultsALM.json del run en `.autoflow/alm/runs/{run_ts}/ResultsALM.json`
//      una entry por test (testId, status, pdfPath, testSet). Siempre corre.
//
// Anti-duplicados del run JSON: si el proceso fue lanzado por nuestros wrappers
// (`run-test.js` / `run-testset.js`), esos scripts setean
// `AUTOFLOW_RUN_PERSISTED=1` antes de invocar npx — en ese caso el reporter
// no escribe `.autoflow/runs/{id}.json` (el wrapper persiste su propia entrada
// con `--grep`, etc.). El PDF y ResultsALM no aplican el skip porque son piezas
// nuevas que solo el reporter sabe armar (tiene `this.tests` con detalles).
//
// Es no-bloqueante: cualquier error al persistir se traga para no romper la
// corrida del test.

const { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative, basename } = require('node:path');
const { generatePdfReport } = require('./pdf-report');
const { writeRunResultsAlm } = require('./results-alm');
const { leerJsonSeguro } = require('./leer-json-seguro');

class AutoFlowRunReporter {
  constructor() {
    this.tests = [];
    this.startTime = null;
  }

  onBegin() {
    this.startTime = Date.now();
  }

  onTestEnd(test, result) {
    // Capturamos solo los test.step() directos del test (no los nested de Playwright
    // como `Before Hooks`, `expect.toBe`, etc.). Sirven para identificar visualmente
    // en el PDF qué step falló y mapearlo a una page.
    const userSteps = (result.steps || [])
      .filter((s) => s.category === 'test.step')
      .map((s) => ({
        title: s.title,
        status: s.error ? 'failed' : 'passed',
      }));
    this.tests.push({
      title: test.title,
      file: test.location?.file ?? null,
      status: result.status,
      duration: result.duration,
      steps: userSteps,
    });
  }

  async onEnd() {
    if (this.tests.length === 0) return;

    const ctx = this._gatherContext();

    // 1. Persistir contexto del PDF a disco para que un proceso hijo lo genere
    //    (chromium.launch desde adentro del proceso de tests entra en conflicto
    //    con los workers de Playwright en algunos setups; spawn separado es
    //    inmune). El reporter solo escribe el `pdf-context.json`; el wrapper
    //    de run-test.js / run-testset.js, o un standalone post-run, levanta
    //    ese JSON y dispara la generación.
    let pdfPath = null;
    const expectedPdfPath = ctx.runDir && ctx.reportName
      ? require('node:path').join(ctx.runDir, `${ctx.reportName}.pdf`)
      : null;
    try {
      const pdfContext = {
        runDir: ctx.runDir,
        mode: ctx.mode,
        reportName: ctx.reportName,
        reportTitle: ctx.reportTitle,
        status: ctx.statusGlobal,
        duration: ctx.duration,
        date: ctx.timestamp,
        executor: ctx.executor,
        canal: ctx.canal,
        urlInicial: ctx.urlInicial,
        testSet: ctx.testSet,
        tests: ctx.testsData,
        expectedPdfPath,
      };
      const ctxPath = require('node:path').join(ctx.runDir, 'pdf-context.json');
      try {
        require('node:fs').mkdirSync(ctx.runDir, { recursive: true });
        require('node:fs').writeFileSync(ctxPath, JSON.stringify(pdfContext, null, 2), 'utf8');
      } catch (errCtx) {
        console.error(`⚠ AutoFlow: no pude persistir pdf-context.json: ${errCtx?.message ?? errCtx}`);
      }

      // Intento de generación inline (best-effort). Si el wrapper también la
      // dispara después, los archivos se sobreescriben (idempotente).
      try {
        pdfPath = await generatePdfReport(pdfContext);
        console.log(`📄 AutoFlow: reporte PDF generado en ${pdfPath}`);
      } catch (errGen) {
        console.error(`⚠ AutoFlow PDF report inline falló (el wrapper puede reintentarlo): ${errGen?.message ?? errGen}`);
        if (errGen?.stack) console.error(errGen.stack);
        // Pasa al wrapper la responsabilidad — leerá pdf-context.json y reintentará.
      }
    } catch (err) {
      console.error(`⚠ AutoFlow PDF report falló (envolvente): ${err?.message ?? err}`);
      if (err?.stack) console.error(err.stack);
    }

    // 2. Escribir ResultsALM.json del run en .autoflow/alm/runs/{ts}/ResultsALM.json.
    //    Formato espejo de lo que consume la integración con ALM (config + tests[]
    //    con testId, testSetId, result Passed/Failed capitalizado, name, duration en s,
    //    url_doc apuntando al PDF físico en runs/ raíz, evidence con el filename).
    try {
      // Derivar el runTimestamp del runDir: 'runs/13_05_2026_15-37-43' → '13_05_2026_15-37-43'.
      const runTimestamp = ctx.runDir ? ctx.runDir.replace(/^.*[/\\]/, '') : null;
      const testsForAlm = ctx.testsData
        .filter((t) => t.testId)
        .map((t) => ({
          testId: t.testId,
          testSetId: ctx.testSet?.id ?? ctx.setId ?? '',
          name: t.name || '',
          status: t.status,
          duration: t.duration,
        }));
      if (runTimestamp && testsForAlm.length > 0) {
        writeRunResultsAlm({
          runTimestamp,
          runDir: ctx.runDir,
          executor: ctx.executor,
          tool: 'Playwright',
          pdfPath,
          tests: testsForAlm,
        });
      }
    } catch (err) {
      console.error(`⚠ AutoFlow ResultsALM falló: ${err?.message ?? err}`);
    }

    // 3. Persistir el run JSON solo si NO vino de un wrapper.
    if (process.env.AUTOFLOW_RUN_PERSISTED !== '1') {
      try {
        this._persistRunJson(ctx);
      } catch {
        // tragado — accesorio.
      }
    }
  }

  // ---------- helpers privados ----------

  _gatherContext() {
    const runDir = process.env.AUTOFLOW_RUN_DIR ?? 'test-results';
    const total = this.tests.length;
    const failed = this.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
    const statusGlobal = failed === 0 ? 'passed' : 'failed';
    const duration = Date.now() - this.startTime;
    const timestamp = new Date().toISOString();

    // Spec path + slug del primer test (todos los tests de una corrida usual
    // comparten spec — un testset spec o un test solo).
    const firstFile = this.tests[0]?.file ?? null;
    let specPath = null, slug = null, setId = null;
    if (firstFile) {
      specPath = relative(process.cwd(), firstFile).replace(/\\/g, '/');
      const m = basename(specPath).match(/^(.+)-(\d+)\.spec\.ts$/);
      if (m) { slug = m[1]; setId = m[2]; }
    }

    // Datos por test: testId, name, status, duration, screens, pages
    const testsData = this.tests.map((t) => {
      const m = t.title.match(/(.+?)\s*\[testId:(\d+)\]/);
      const testId = m ? m[2] : null;
      const name = m ? m[1].trim() : t.title;
      const screens = testId ? listScreensFor(runDir, testId) : [];
      const pages = computePagesForTest(testId, t.file, t.status, t.steps || []);
      return { testId, name, status: t.status, duration: t.duration, screens, pages };
    });

    // Mode + reportName + reportTitle: si hay 1 test, es 'test' y el filename
    // es {testId}.pdf; si hay varios, es 'testset' y el filename es {slug}.pdf.
    let mode, reportName, reportTitle, testSet;
    if (this.tests.length === 1) {
      mode = 'test';
      const t = testsData[0];
      reportName = t.testId || 'test';
      reportTitle = t.name || 'Test';
      // El test pertenece a un testset (el spec lo agrupa). Cargar metadata.
      testSet = slug ? loadTestSet(slug) : null;
    } else {
      mode = 'testset';
      reportName = slug || 'testset';
      const ts = slug ? loadTestSet(slug) : null;
      testSet = ts;
      reportTitle = ts?.nombre || slug || 'Test Set';
    }

    // Canal + urlInicial: leemos del session.json del primer test (todos comparten).
    const firstTestId = testsData[0]?.testId;
    let canal = null, urlInicial = null;
    if (firstTestId) {
      const session = leerJson(`.autoflow/recordings/${firstTestId}-session.json`);
      canal = session?.canal ?? null;
      urlInicial = session?.urlInicial ?? null;
    }

    // Ejecutor: user.json.
    const executor = leerJson('.autoflow/user.json');

    return {
      runDir, specPath, slug, setId, statusGlobal, duration, timestamp,
      mode, reportName, reportTitle, testSet,
      canal, urlInicial, executor,
      testsData, total, failed,
    };
  }

  _persistRunJson(ctx) {
    const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
    const passed = this.tests.filter((t) => t.status === 'passed').length;
    const run = {
      id: runId,
      timestamp: ctx.timestamp,
      tipo: 'reporter',
      specPath: ctx.specPath,
      testSetSlug: ctx.slug,
      testSetId: ctx.setId,
      grep: null,
      testIds: ctx.testsData.map((t) => t.testId).filter(Boolean),
      status: ctx.statusGlobal,
      exitCode: ctx.statusGlobal === 'passed' ? 0 : 1,
      duration: ctx.duration,
      total: ctx.total,
      passed,
      failed: ctx.failed,
      artifactsDir: ctx.runDir,
    };
    const runsDir = '.autoflow/runs';
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify(run, null, 2), 'utf8');
  }
}

// ---------- utils ----------

function leerJson(path) {
  return leerJsonSeguro(path, null);
}

/**
 * Computa la secuencia de pages que recorre un test + dónde falló (si aplica).
 *
 * Devuelve `[{ name, status: 'passed' | 'failed' }]` ordenado por aparición.
 * Si el test pasó, todas las entries son `'passed'`.
 * Si falló, intentamos mapear el step fallido → page parseando el spec:
 *   1. Buscamos el bloque `test.step('<failedTitle>', async () => { ... })`.
 *   2. Adentro, buscamos `await {var}.{metodo}(...)`.
 *   3. El `{var}` lo mapeamos via `const var = new PageClass(page)` que vive arriba en el spec.
 * Si el parseo no logra identificar la page, fallback: la última de la secuencia es la falla.
 * Si no hay path.json, retornamos array vacío (el card del PDF no se renderiza).
 */
function computePagesForTest(testId, specFile, status, steps) {
  if (!testId) return [];

  // 1) Secuencia de pages desde path.json + nodos.json.
  const pathFile = `.autoflow/recordings/${testId}-path.json`;
  if (!existsSync(pathFile)) return [];
  const pathData = leerJson(pathFile);
  const ids = pathData?.path;
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const nodos = leerJson('.autoflow/nodos.json') || {};
  const seq = [];
  for (const id of ids) {
    const page = nodos[id]?.page;
    if (!page) continue;
    if (seq.length === 0 || seq[seq.length - 1] !== page) seq.push(page);
  }
  if (seq.length === 0) return [];

  // 2) Si el test pasó, todas verdes.
  if (status === 'passed') {
    return seq.map((name) => ({ name, status: 'passed' }));
  }

  // 3) Test falló — buscar el step fallido y mapearlo a una page.
  let failedPage = null;
  const failedStep = steps.find((s) => s.status === 'failed');
  if (failedStep && specFile && existsSync(specFile)) {
    failedPage = mapFailedStepToPage(specFile, failedStep.title);
  }

  // 4) Marcar la secuencia hasta el page fallido (inclusive); el resto se trunca
  //    porque visualmente el test "se cortó ahí" — mostrar pages posteriores
  //    confundiría (no las ejecutó realmente).
  if (failedPage && seq.includes(failedPage)) {
    const idx = seq.indexOf(failedPage);
    return [
      ...seq.slice(0, idx).map((name) => ({ name, status: 'passed' })),
      { name: failedPage, status: 'failed' },
    ];
  }

  // 5) Fallback: no pudimos mapear → la última de la secuencia es la falla.
  return seq.map((name, i) => ({
    name,
    status: i === seq.length - 1 ? 'failed' : 'passed',
  }));
}

/**
 * Parsea un spec de Playwright para resolver qué Page Object protagoniza un
 * `test.step('<title>', ...)`. Devuelve el nombre de la page (sin sufijo
 * `Page`) o `null` si no se puede mapear con confianza.
 */
function mapFailedStepToPage(specFile, stepTitle) {
  let src;
  try { src = readFileSync(specFile, 'utf8'); }
  catch { return null; }

  // Construir mapa { varName: PageClass } a partir de `const {var} = new {Class}(page)`.
  const varToClass = {};
  const reInst = /const\s+(\w+)\s*=\s*new\s+(\w+)\s*\(\s*page\s*\)/g;
  let m;
  while ((m = reInst.exec(src)) !== null) {
    varToClass[m[1]] = m[2];
  }

  // Encontrar el bloque del step. El title viene del runtime (sin escape),
  // pero en el código está en JS string literal — escapamos para regex.
  const escapedTitle = stepTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reBlock = new RegExp(
    `await\\s+test\\.step\\(\\s*['"\`]${escapedTitle}['"\`]\\s*,\\s*async[^]*?\\{([^]*?)\\}\\s*\\)\\s*;`,
    'm',
  );
  const block = reBlock.exec(src);
  if (!block) return null;

  // Adentro: `await {var}.{metodo}(...)` — el primer match es el más relevante.
  const reCall = /await\s+(\w+)\.\w+\s*\(/;
  const callMatch = reCall.exec(block[1]);
  if (!callMatch) return null;
  const varName = callMatch[1];
  const className = varToClass[varName];
  if (!className) return null;

  // Normalizar a la convención del campo `page` de nodos.json: sin sufijo `Page` no
  // se hace acá — el campo `page` en nodos.json **sí** incluye el sufijo, así que
  // devolvemos el nombre completo (`HomePage`, `LoginPage`, etc.) para que el match
  // contra `seq` funcione.
  return className;
}

function listScreensFor(runDir, testId) {
  const dir = join(runDir, 'screens', testId);
  if (!existsSync(dir)) return [];
  try {
    // Orden cronológico ascendente (más viejo primero). Los runs viven en su
    // propio runDir, así que mtime == momento de captura. El sort lex sobre el
    // filename `{label}_DD_MM_YYYY_HH_MM_SS.jpg` mezclaba por label primero, no
    // por tiempo — el PDF salía en orden alfabético, no en orden de ejecución.
    return readdirSync(dir)
      .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
      .map((f) => {
        const path = join(dir, f);
        let mtime = 0;
        try { mtime = statSync(path).mtimeMs; } catch {}
        return { path, mtime };
      })
      .sort((a, b) => a.mtime - b.mtime)
      .map((entry) => entry.path);
  } catch {
    return [];
  }
}

function loadTestSet(slug) {
  const ts = leerJson(`.autoflow/testsets/${slug}.json`);
  if (!ts) return null;
  return { slug: ts.slug ?? slug, id: ts.id ?? null, nombre: ts.nombre ?? slug };
}

module.exports = AutoFlowRunReporter;
