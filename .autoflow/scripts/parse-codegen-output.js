// Parsea el .spec.ts generado por `playwright codegen` y produce un JSON estructurado
// con la lista de pasos (goto, fill, click, press, check, select) y URLs visitadas.
//
// Uso: node .autoflow/scripts/parse-codegen-output.js <numero>

const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const numero = process.argv[2];
if (!numero) {
  console.error('Uso: node .autoflow/scripts/parse-codegen-output.js <numero>');
  process.exit(1);
}

const specPath = join('.autoflow/recordings', `${numero}.spec.ts`);
const sessionPath = join('.autoflow/recordings', `${numero}-session.json`);
const outPath = join('.autoflow/recordings', `${numero}-parsed.json`);

if (!existsSync(specPath)) {
  console.error(`❌ No encuentro ${specPath}.`);
  process.exit(1);
}
if (!existsSync(sessionPath)) {
  console.error(`❌ No encuentro ${sessionPath}.`);
  process.exit(1);
}

const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
const spec = readFileSync(specPath, 'utf8');

const pasos = [];
const urlsVisitadas = [];
let indice = 0;

// Extrae el texto identificable de un selector (nombre del rol, label, texto).
function extraerTexto(selector) {
  const mRole = selector.match(/getByRole\(['"]\w+['"],\s*\{\s*name:\s*['"](.+?)['"]/);
  if (mRole) return mRole[1];
  const mText = selector.match(/getByText\(['"](.+?)['"]\)/);
  if (mText) return mText[1];
  const mLabel = selector.match(/getByLabel\(['"](.+?)['"]\)/);
  if (mLabel) return mLabel[1];
  const mTestId = selector.match(/getByTestId\(['"](.+?)['"]\)/);
  if (mTestId) return mTestId[1];
  const mLocator = selector.match(/locator\(['"](.+?)['"]\)/);
  if (mLocator) return mLocator[1];
  return null;
}

// Matchea getByRole/getByText/getByLabel/getByTestId/getByPlaceholder/locator(...)
const SEL = '(getBy\\w+\\(.+?\\)|locator\\(.+?\\))';

// Parser por línea — suficiente para el output de codegen.
const lineas = spec.split('\n');
for (const linea of lineas) {
  const limpia = linea.trim();

  // await expect(page.<SEL>).<matcher>(<arg opcional>)
  let mAssert = limpia.match(
    new RegExp(`^await expect\\(page\\.${SEL}\\)\\.(\\w+)\\((['"\`](.*?)['"\`])?\\)`),
  );
  if (mAssert) {
    indice++;
    pasos.push({
      indice,
      tipo: 'assert',
      selector: mAssert[1],
      matcher: mAssert[2],
      valor: mAssert[4] ?? null,
      etiqueta: extraerTexto(mAssert[1]),
      raw: limpia,
    });
    continue;
  }

  // await expect(page).<matcher>(<arg>)  (asserts a nivel page: toHaveURL, toHaveTitle)
  mAssert = limpia.match(/^await expect\(page\)\.(\w+)\(['"`](.+?)['"`]\)/);
  if (mAssert) {
    indice++;
    pasos.push({
      indice,
      tipo: 'assert',
      selector: 'page',
      matcher: mAssert[1],
      valor: mAssert[2],
      raw: limpia,
    });
    continue;
  }

  if (!limpia.startsWith('await page.')) continue;

  // page.goto('https://...')
  let m = limpia.match(/^await page\.goto\(['"](.+?)['"]\)/);
  if (m) {
    indice++;
    pasos.push({ indice, tipo: 'goto', url: m[1], raw: limpia });
    urlsVisitadas.push(m[1]);
    continue;
  }

  // page.getByX(...).click()
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.click\\(\\)`));
  if (m) {
    indice++;
    pasos.push({
      indice,
      tipo: 'click',
      selector: m[1],
      textoBoton: extraerTexto(m[1]),
      raw: limpia,
    });
    continue;
  }

  // page.getByX(...).fill('valor')
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.fill\\(['"](.*?)['"]\\)`));
  if (m) {
    indice++;
    pasos.push({
      indice,
      tipo: 'fill',
      selector: m[1],
      etiqueta: extraerTexto(m[1]),
      valor: m[2],
      raw: limpia,
    });
    continue;
  }

  // page.getByX(...).press('Key')
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.press\\(['"](.+?)['"]\\)`));
  if (m) {
    indice++;
    pasos.push({
      indice,
      tipo: 'press',
      selector: m[1],
      tecla: m[2],
      raw: limpia,
    });
    continue;
  }

  // page.getByX(...).check() / .uncheck()
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.(check|uncheck)\\(\\)`));
  if (m) {
    indice++;
    pasos.push({
      indice,
      tipo: m[2],
      selector: m[1],
      etiqueta: extraerTexto(m[1]),
      raw: limpia,
    });
    continue;
  }

  // page.getByX(...).selectOption('valor')
  m = limpia.match(new RegExp(`^await page\\.${SEL}\\.selectOption\\(['"](.+?)['"]\\)`));
  if (m) {
    indice++;
    pasos.push({
      indice,
      tipo: 'select',
      selector: m[1],
      etiqueta: extraerTexto(m[1]),
      valor: m[2],
      raw: limpia,
    });
    continue;
  }
}

const resultado = {
  metadata: {
    numero: session.numero,
    nombre: session.nombre,
    canal: session.canal,
    urlInicial: session.urlInicial,
    qa: session.qa,
    fechaInicio: session.fechaInicio,
    fechaFin: session.fechaFin ?? null,
  },
  pasos,
  urlsVisitadas,
};

writeFileSync(outPath, JSON.stringify(resultado, null, 2), 'utf8');
console.log(`✅ Parseado: ${outPath} (${pasos.length} pasos, ${urlsVisitadas.length} URLs)`);
