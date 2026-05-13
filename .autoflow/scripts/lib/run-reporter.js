// Reporter de Playwright que centraliza 3 responsabilidades post-run:
//   1. Persistir el run JSON en `.autoflow/runs/{id}.json` (solo si NO vino de
//      un wrapper — el wrapper ya escribe su entry con más contexto). Esto cubre
//      el caso de `npx playwright test ...` directo / plugin de VSCode.
//   2. Generar el reporte PDF en `{runDir}/{name}.pdf` con todas las evidencias
//      (screenshots tomados por la fixture `screen()` durante el test). Siempre
//      corre, sin importar el wrapper.
//   3. Appendear al daily aggregator `.autoflow/runs/{DD_MM_YYYY}/ResultsALM.json`
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

const { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } = require('node:fs');
const { join, relative, basename } = require('node:path');
const { generatePdfReport } = require('./pdf-report');
const { appendResultsAlm } = require('./results-alm');
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
    this.tests.push({
      title: test.title,
      file: test.location?.file ?? null,
      status: result.status,
      duration: result.duration,
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

    // 2. Appendear a ResultsALM.json (siempre).
    try {
      const entries = ctx.testsData.map((t) => ({
        testId: t.testId,
        status: t.status === 'passed' ? 'passed' : 'failed',
        pdfPath: pdfPath ? relative(process.cwd(), pdfPath).replace(/\\/g, '/') : null,
        testSet: ctx.testSet?.slug ?? null,
      })).filter((e) => e.testId);
      if (entries.length > 0) appendResultsAlm(entries);
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

    // Datos por test: testId, name, status, duration, screens
    const testsData = this.tests.map((t) => {
      const m = t.title.match(/(.+?)\s*\[testId:(\d+)\]/);
      const testId = m ? m[2] : null;
      const name = m ? m[1].trim() : t.title;
      const screens = testId ? listScreensFor(runDir, testId) : [];
      return { testId, name, status: t.status, duration: t.duration, screens };
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

function listScreensFor(runDir, testId) {
  const dir = join(runDir, 'screens', testId);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
      .sort()
      .map((f) => join(dir, f));
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
