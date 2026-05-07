// Exporta un Test a un archivo importable por ALM (xlsx por defecto, csv o json).
// Parsea el spec del Test Set, extrae los `test.step` del Test elegido, y emite
// un row por paso con: Test ID, Test Name, Step Number, Step Name, Description,
// Expected Result.
//
// Description se deriva técnicamente del cuerpo del step (llamadas a métodos del
// PO + page.goto). Expected Result se deriva de los `await expect(...)` del step
// (vacío si no hay asserts).
//
// Uso:
//   node .autoflow/scripts/exportar-alm.js <slug> --test=<testId> [--format=xlsx|csv|json]
//
// Output: .autoflow/alm-exports/{slug}-testId-{testId}-{ts}.{ext}
// Imprime al final una línea AUTOFLOW_EXPORT: { ok, path, rows, format } parseable por el agente.

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const XLSX = require('xlsx');

// ------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------

const slug = process.argv[2];
const testIdArg = (process.argv.find((a) => a.startsWith('--test=')) || '').slice('--test='.length);
const formatArg = ((process.argv.find((a) => a.startsWith('--format=')) || '--format=xlsx').slice('--format='.length)) || 'xlsx';

if (!slug || !testIdArg) {
  console.error('Uso: node .autoflow/scripts/exportar-alm.js <slug> --test=<testId> [--format=xlsx|csv|json]');
  process.exit(1);
}
if (!['xlsx', 'csv', 'json'].includes(formatArg)) {
  console.error(`❌ format inválido: "${formatArg}". Usá xlsx | csv | json.`);
  process.exit(1);
}

const setPath = join('.autoflow/testsets', `${slug}.json`);
if (!existsSync(setPath)) {
  console.error(`❌ No encuentro ${setPath}.`);
  process.exit(1);
}
const set = JSON.parse(readFileSync(setPath, 'utf8'));
if (!set.specPath || !existsSync(set.specPath)) {
  console.error(`❌ Spec no encontrado: ${set.specPath}`);
  process.exit(1);
}

const spec = readFileSync(set.specPath, 'utf8');

// ------------------------------------------------------------------------------------
// Parser del spec — saca el Test elegido y sus steps
// ------------------------------------------------------------------------------------

// Encuentra el índice de la `}` que cierra el `{` en `src[openIdx]`. Maneja strings
// y comentarios para no confundirse con `{` / `}` dentro de literales.
function brazoCerrante(src, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  let inSingle = false, inDouble = false, inBacktick = false, inLine = false, inBlock = false;
  while (i < src.length && depth > 0) {
    const c = src[i];
    const next = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; }
    else if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++; } }
    else if (inSingle) { if (c === '\\') i++; else if (c === "'") inSingle = false; }
    else if (inDouble) { if (c === '\\') i++; else if (c === '"') inDouble = false; }
    else if (inBacktick) { if (c === '\\') i++; else if (c === '`') inBacktick = false; }
    else {
      if (c === '/' && next === '/') { inLine = true; i++; }
      else if (c === '/' && next === '*') { inBlock = true; i++; }
      else if (c === "'") inSingle = true;
      else if (c === '"') inDouble = true;
      else if (c === '`') inBacktick = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    i++;
  }
  return -1;
}

// Encuentra el `)` que cierra el `(` en `src[openIdx]`. Versión simple sin
// tracking de strings — alcanza para nuestros casos generados.
function parenCerrante(src, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) return i; }
    i++;
  }
  return src.length;
}

function parsearTest(spec, testIdBuscado) {
  // Buscar `test('... [testId:N]', async (...) => {`
  const re = /test\(\s*['"`](.+?)\s*\[testId:(\d+)\]\s*['"`]\s*,\s*async\s*\([^)]*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(spec)) !== null) {
    if (m[2] === testIdBuscado) {
      const inicioCuerpo = m.index + m[0].length;
      const finCuerpo = brazoCerrante(spec, inicioCuerpo - 1);
      if (finCuerpo === -1) return null;
      return {
        nombre: m[1].trim(),
        testId: m[2],
        cuerpo: spec.slice(inicioCuerpo, finCuerpo),
      };
    }
  }
  return null;
}

function parsearSteps(cuerpoTest) {
  // Cada `test.step('NAME', async () => { ... })` o `const X = await test.step(...)`.
  const steps = [];
  const re = /test\.step\(\s*['"`](.+?)['"`]\s*,\s*async\s*\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(cuerpoTest)) !== null) {
    const inicioCuerpo = m.index + m[0].length;
    const finCuerpo = brazoCerrante(cuerpoTest, inicioCuerpo - 1);
    if (finCuerpo === -1) continue;
    steps.push({
      nombre: m[1].trim(),
      cuerpo: cuerpoTest.slice(inicioCuerpo, finCuerpo),
    });
    re.lastIndex = finCuerpo + 1;
  }
  return steps;
}

// ------------------------------------------------------------------------------------
// Description y Expected Result derivados del cuerpo de cada step
// ------------------------------------------------------------------------------------

function derivarDescripcion(cuerpo) {
  const lineas = [];
  // 1. await page.goto('url') o await page.goto(variable)
  for (const m of cuerpo.matchAll(/await\s+page\.goto\(\s*([^)]+)\)/g)) {
    lineas.push(`Navegar a ${m[1].trim()}`);
  }
  // 2. await xPage.method(args) — donde xPage NO es page/expect/test
  for (const m of cuerpo.matchAll(/await\s+([a-zA-Z_$][\w$]*)\.(\w+)\(([^)]*)\)/g)) {
    const [, variable, metodo, args] = m;
    if (['page', 'expect', 'test'].includes(variable)) continue;
    if (variable.startsWith('_raw_') || variable.startsWith('_clean_')) continue;
    lineas.push(`Llamar a ${variable}.${metodo}(${args.trim()})`);
  }
  // 3. const X = new XxxPage(page) — instanciación directa
  for (const m of cuerpo.matchAll(/(?:const|let)\s+\w+\s*=\s*new\s+(\w+Page)\(/g)) {
    lineas.push(`Instanciar ${m[1]}`);
  }
  // 4. return xPage.method(args) — el step retorna la próxima Page
  for (const m of cuerpo.matchAll(/\breturn\s+([a-zA-Z_$][\w$]*)\.(\w+)\(([^)]*)\)/g)) {
    const [, variable, metodo, args] = m;
    if (['page', 'expect'].includes(variable)) continue;
    lineas.push(`Llamar a ${variable}.${metodo}(${args.trim()}) y devolver la siguiente Page`);
  }
  return lineas.join('. ');
}

function derivarExpected(cuerpo) {
  // Buscar cada `await expect(TARGET).MATCHER(ARGS)` con balance de paréntesis.
  const lineas = [];
  let i = 0;
  while (i < cuerpo.length) {
    const idx = cuerpo.indexOf('await expect(', i);
    if (idx === -1) break;
    const inicioTarget = idx + 'await expect('.length;
    const finTarget = parenCerrante(cuerpo, inicioTarget - 1);
    const target = cuerpo.slice(inicioTarget, finTarget).trim();
    // Después del `)` esperamos `.matcher(`
    let j = finTarget + 1;
    while (j < cuerpo.length && /\s/.test(cuerpo[j])) j++;
    if (cuerpo[j] !== '.') { i = finTarget + 1; continue; }
    const finNombre = cuerpo.indexOf('(', j);
    if (finNombre === -1) { i = finTarget + 1; continue; }
    const matcher = cuerpo.slice(j + 1, finNombre).trim();
    const inicioArgs = finNombre + 1;
    const finArgs = parenCerrante(cuerpo, inicioArgs - 1);
    const args = cuerpo.slice(inicioArgs, finArgs).trim();
    lineas.push(args ? `expect(${target}).${matcher}(${args})` : `expect(${target}).${matcher}()`);
    i = finArgs + 1;
  }
  return lineas.join('; ');
}

// ------------------------------------------------------------------------------------
// Construir las filas y emitir el archivo
// ------------------------------------------------------------------------------------

const test = parsearTest(spec, testIdArg);
if (!test) {
  console.error(`❌ No encontré el Test [testId:${testIdArg}] en ${set.specPath}.`);
  process.exit(1);
}

const stepsParseados = parsearSteps(test.cuerpo);
if (stepsParseados.length === 0) {
  console.error(`⚠ El Test [testId:${testIdArg}] no tiene bloques test.step. Generando un único row con el Test entero.`);
  stepsParseados.push({ nombre: test.nombre, cuerpo: test.cuerpo });
}

const filas = [
  ['Test ID', 'Test Name', 'Step Number', 'Step Name', 'Description', 'Expected Result'],
];
stepsParseados.forEach((step, idx) => {
  filas.push([
    test.testId,
    test.nombre,
    idx + 1,
    step.nombre,
    derivarDescripcion(step.cuerpo),
    derivarExpected(step.cuerpo),
  ]);
});

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const baseName = `${slug}-testId-${test.testId}-${ts}`;
const outDir = '.autoflow/alm-exports';
mkdirSync(outDir, { recursive: true });

let outPath;
if (formatArg === 'xlsx') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(filas);
  // Anchos sugeridos.
  ws['!cols'] = [
    { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 36 }, { wch: 60 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Test');
  outPath = join(outDir, `${baseName}.xlsx`);
  XLSX.writeFile(wb, outPath);
} else if (formatArg === 'csv') {
  const escCsv = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = filas.map((r) => r.map(escCsv).join(',')).join('\n');
  outPath = join(outDir, `${baseName}.csv`);
  writeFileSync(outPath, csv, 'utf8');
} else {
  // json
  const headers = filas[0];
  const rows = filas.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  const payload = {
    testSetSlug: slug,
    testSetId: set.id,
    testSetNombre: set.nombre,
    testId: test.testId,
    testNombre: test.nombre,
    rows,
  };
  outPath = join(outDir, `${baseName}.json`);
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
}

console.log('');
console.log(`AUTOFLOW_EXPORT: ${JSON.stringify({ ok: true, path: outPath, rows: stepsParseados.length, format: formatArg })}`);
