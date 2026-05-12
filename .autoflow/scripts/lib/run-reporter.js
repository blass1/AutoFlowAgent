// Reporter de Playwright que persiste cada corrida en `.autoflow/runs/` para
// que el dashboard la muestre, sin importar cómo se haya disparado el test.
//
// Resuelve el bug: si el QA corre `npx playwright test ...` directo en terminal
// (sin pasar por `run-test.js` / `run-testset.js`), los runs no quedaban en
// `.autoflow/runs/` y el dashboard reportaba "0 ejecuciones" aunque el test
// haya pasado.
//
// Se enchufa como reporter adicional en `playwright.config.ts`. Es no-bloqueante:
// cualquier error al persistir se traga (un test no debe fallar por esto).
//
// Anti-duplicados: si el proceso fue lanzado por nuestros wrappers
// (`run-test.js` / `run-testset.js`), esos scripts setean
// `AUTOFLOW_RUN_PERSISTED=1` antes de invocar npx — en ese caso el reporter
// se desactiva y deja que el wrapper persista (el wrapper sabe el `--grep`
// y el contexto, info que el reporter no tiene a mano).

const { writeFileSync, mkdirSync } = require('node:fs');
const { join, relative, basename } = require('node:path');

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

  onEnd() {
    if (process.env.AUTOFLOW_RUN_PERSISTED === '1') return;
    if (this.tests.length === 0) return;

    const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
    const total = this.tests.length;
    const failed = this.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
    const passed = this.tests.filter((t) => t.status === 'passed').length;

    // Extraer testIds del title — formato: "{nombre} [testId:NNN]"
    const testIds = [];
    for (const t of this.tests) {
      const m = t.title.match(/\[testId:(\d+)\]/);
      if (m) testIds.push(m[1]);
    }

    // Inferir specPath/slug/id del primer test (mayoría de corridas son sobre un único spec).
    let specPath = null;
    let testSetSlug = null;
    let testSetId = null;
    const firstFile = this.tests[0]?.file;
    if (firstFile) {
      specPath = relative(process.cwd(), firstFile).replace(/\\/g, '/');
      const slugMatch = basename(specPath).match(/^(.+)-(\d+)\.spec\.ts$/);
      if (slugMatch) {
        testSetSlug = slugMatch[1];
        testSetId = slugMatch[2];
      }
    }

    const run = {
      id: runId,
      timestamp: new Date().toISOString(),
      tipo: 'reporter',
      specPath,
      testSetSlug,
      testSetId,
      grep: null,
      testIds,
      status: failed === 0 ? 'passed' : 'failed',
      exitCode: failed === 0 ? 0 : 1,
      duration: Date.now() - this.startTime,
      total,
      passed,
      failed,
      // Si el run vino sin wrapper, AUTOFLOW_RUN_DIR no está seteado y los artifacts
      // quedaron en el outputDir por default de Playwright (`test-results/`).
      artifactsDir: process.env.AUTOFLOW_RUN_DIR ?? 'test-results',
    };

    try {
      const runsDir = '.autoflow/runs';
      mkdirSync(runsDir, { recursive: true });
      writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify(run, null, 2), 'utf8');
    } catch {
      // Tragar errores: el reporter no debe romper la corrida del test.
    }
  }
}

module.exports = AutoFlowRunReporter;
