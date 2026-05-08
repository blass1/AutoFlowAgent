// Exporta un Test a un archivo importable por ALM (xlsx por defecto, csv o json).
// Cada Nodo de la traza del Test se traduce a UN row humanizado con las columnas:
//
//   Test ID | Test Name | Step Number | Step | Description | Expected Result
//
// La fuente de verdad es:
//   - .autoflow/recordings/{testId}-path.json  (la secuencia de ids visitados)
//   - .autoflow/nodos.json                     (la metadata de cada Nodo)
//
// La descripción y expected result se generan en castellano humanizado a partir
// de la `accion`, `etiqueta`, `valor`, `matcher`, `varName` y `condicion` del Nodo —
// pensado para que un QA lo lea en ALM y pueda recrear el caso a mano.
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
const specPathFinal = set.specPath ?? set.casos?.[0]?.specPath;
if (!specPathFinal || !existsSync(specPathFinal)) {
  console.error(`❌ Spec no encontrado: ${specPathFinal}`);
  process.exit(1);
}

const spec = readFileSync(specPathFinal, 'utf8');

// ------------------------------------------------------------------------------------
// Identificar el Test (nombre + testId) parseando el spec
// ------------------------------------------------------------------------------------

function buscarTestNombre(spec, testIdBuscado) {
  // test('NOMBRE [testId:NNN]', ...)
  const re = /test\(\s*(['"`])(.+?)\s*\[testId:(\d+)\]\s*\1/g;
  let m;
  while ((m = re.exec(spec)) !== null) {
    if (m[3] === testIdBuscado) return m[2].trim();
  }
  return null;
}

const testNombre = buscarTestNombre(spec, testIdArg);
if (!testNombre) {
  console.error(`❌ No encontré test('... [testId:${testIdArg}]', ...) en ${specPathFinal}.`);
  process.exit(1);
}

// ------------------------------------------------------------------------------------
// Cargar la traza del Test + nodos.json
// ------------------------------------------------------------------------------------

const tracePath = `.autoflow/recordings/${testIdArg}-path.json`;
if (!existsSync(tracePath)) {
  console.error(`❌ No encuentro la traza ${tracePath}.`);
  console.error(`   El Test [testId:${testIdArg}] todavía no fue grabado y procesado por generar-pom.md,`);
  console.error(`   o el path.json se borró. Volvé a grabar el caso o regenerá la traza con:`);
  console.error(`     node .autoflow/scripts/generar-traza.js ${testIdArg}`);
  process.exit(1);
}
const nodosPath = '.autoflow/nodos.json';
if (!existsSync(nodosPath)) {
  console.error(`❌ No encuentro ${nodosPath}.`);
  process.exit(1);
}

const trace = JSON.parse(readFileSync(tracePath, 'utf8'));
const nodos = JSON.parse(readFileSync(nodosPath, 'utf8'));

if (!Array.isArray(trace.path) || trace.path.length === 0) {
  console.error(`❌ La traza ${tracePath} tiene path vacío.`);
  process.exit(1);
}

// ------------------------------------------------------------------------------------
// Humanización: cada Nodo → { step, descripcion, expected }
// ------------------------------------------------------------------------------------

function tipoElemento(selector) {
  // Hoja del chain (lo último, ignorando segmentos `iframe:X`).
  const tokens = (selector || '').split('>>').map((s) => s.trim()).filter(Boolean);
  let hoja = tokens[tokens.length - 1] || '';
  // Si la hoja es un iframe-container, mirar el segmento anterior (raro).
  if (hoja.startsWith('iframe:') && tokens.length > 1) hoja = tokens[tokens.length - 2];

  const m = hoja.match(/^getByRole:(\w+)/);
  if (m) {
    const role = m[1].toLowerCase();
    const map = {
      button: 'el botón',
      link: 'el enlace',
      tab: 'la pestaña',
      menuitem: 'la opción del menú',
      checkbox: 'el checkbox',
      radio: 'la opción',
      textbox: 'el campo',
      heading: 'el título',
      listitem: 'el ítem',
      dialog: 'el diálogo',
      alert: 'la alerta',
      img: 'la imagen',
      banner: 'el banner',
      navigation: 'la barra de navegación',
      region: 'la sección',
      combobox: 'el desplegable',
      switch: 'el switch',
      cell: 'la celda',
      row: 'la fila',
      columnheader: 'el encabezado de columna',
      article: 'el artículo',
    };
    return map[role] || `el elemento (${role})`;
  }
  if (hoja.startsWith('getByLabel:')) return 'el campo';
  if (hoja.startsWith('getByPlaceholder:')) return 'el campo';
  if (hoja.startsWith('getByText:')) return 'el texto';
  if (hoja.startsWith('getByTestId:')) return 'el elemento';
  if (hoja === 'page' || !hoja) return 'la página';
  return 'el elemento';
}

function valorPretty(valor) {
  if (valor == null) return '';
  if (valor === '*') return 'el valor correspondiente';
  return `"${valor}"`;
}

function capitalizar(s) {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function sujetoFrase(nodo) {
  const tipo = tipoElemento(nodo.selector);
  const etiq = nodo.etiqueta || '';
  return etiq ? `${tipo} "${etiq}"` : tipo;
}

function humanizar(nodo, idCrudo) {
  if (!nodo) {
    return {
      step: 'Acción no resuelta',
      descripcion: `(no se pudo resolver el Nodo ${idCrudo})`,
      expected: '',
    };
  }

  const sujeto = sujetoFrase(nodo);

  switch (nodo.accion) {
    case 'goto': {
      // selector="goto:/login" o valor=URL completa
      const url = nodo.valor || (nodo.selector || '').replace(/^goto:/, '');
      return {
        step: 'Navegar',
        descripcion: `Navegar a ${url}`,
        expected: 'La página solicitada se carga correctamente.',
      };
    }
    case 'click':
      return {
        step: 'Click',
        descripcion: `Hacer click en ${sujeto}`,
        expected: `${capitalizar(sujeto)} se acciona correctamente.`,
      };
    case 'fill':
      // En el modelo, 'fill' es nuestro pressSequentially (acción lógica).
      return {
        step: 'Llenar campo',
        descripcion: `Ingresar ${valorPretty(nodo.valor)} en ${sujeto}`,
        expected: `${capitalizar(sujeto)} muestra el valor ingresado.`,
      };
    case 'press':
      return {
        step: 'Presionar tecla',
        descripcion: `Presionar la tecla "${nodo.valor}" en ${sujeto}`,
        expected: 'La tecla envía la acción asociada al elemento.',
      };
    case 'check':
      return {
        step: 'Tildar',
        descripcion: `Tildar ${sujeto}`,
        expected: `${capitalizar(sujeto)} queda tildado.`,
      };
    case 'uncheck':
      return {
        step: 'Destildar',
        descripcion: `Destildar ${sujeto}`,
        expected: `${capitalizar(sujeto)} queda destildado.`,
      };
    case 'selectOption':
      return {
        step: 'Seleccionar',
        descripcion: `Seleccionar ${valorPretty(nodo.valor)} en ${sujeto}`,
        expected: `La opción ${valorPretty(nodo.valor)} queda seleccionada en ${sujeto}.`,
      };
    case 'hover':
      return {
        step: 'Hover',
        descripcion: `Pasar el mouse sobre ${sujeto}`,
        expected: 'Aparece el tooltip o menú asociado al elemento.',
      };
    case 'setInputFiles':
      return {
        step: 'Subir archivo',
        descripcion: `Seleccionar y subir el archivo en ${sujeto}`,
        expected: 'El archivo queda adjuntado en el formulario.',
      };
    case 'assert':
      return humanizarAssert(nodo, sujeto);
    case 'capturar':
      return {
        step: 'Capturar valor',
        descripcion: `Extraer el valor de ${sujeto} y guardarlo como "${nodo.varName}"`,
        expected: 'El valor queda registrado para verificación posterior.',
      };
    case 'verificar':
      return humanizarVerificar(nodo, sujeto);
    default:
      return {
        step: capitalizar(nodo.accion),
        descripcion: `Ejecutar la acción "${nodo.accion}" sobre ${sujeto}`,
        expected: '',
      };
  }
}

function humanizarAssert(nodo, sujeto) {
  const matcher = nodo.matcher;
  const valor = nodo.valor;

  // toHaveAttribute lleva 2 valores: nombre del atributo + valor esperado
  if (matcher === 'toHaveAttribute') {
    return {
      step: 'Validar atributo',
      descripcion: `Validar que ${sujeto} tenga el atributo "${valor}" con valor "${nodo.valorEsperado || ''}"`,
      expected: `${capitalizar(sujeto)} expone el atributo "${valor}" con el valor "${nodo.valorEsperado || ''}".`,
    };
  }

  // toHaveClass puede venir con regex (modoValor === 'regex') o string literal
  if (matcher === 'toHaveClass') {
    if (nodo.modoValor === 'regex') {
      return {
        step: 'Validar clase CSS',
        descripcion: `Validar que ${sujeto} tenga una clase CSS que matchee con el patrón /${valor}/`,
        expected: `${capitalizar(sujeto)} incluye una clase CSS que coincide con el patrón.`,
      };
    }
    return {
      step: 'Validar clase CSS',
      descripcion: `Validar que ${sujeto} tenga la clase CSS "${valor}"`,
      expected: `${capitalizar(sujeto)} incluye la clase CSS "${valor}".`,
    };
  }

  if (sujeto === 'la página') {
    // Asserts a nivel page (selector="page"): toHaveURL, toHaveTitle.
    if (matcher === 'toHaveURL') {
      return {
        step: 'Validar URL',
        descripcion: `Validar que la URL del navegador sea ${valorPretty(valor)}`,
        expected: `La URL del navegador es ${valorPretty(valor)}.`,
      };
    }
    if (matcher === 'toHaveTitle') {
      return {
        step: 'Validar título',
        descripcion: `Validar que el título de la pestaña sea ${valorPretty(valor)}`,
        expected: `El título de la pestaña es ${valorPretty(valor)}.`,
      };
    }
  }

  switch (matcher) {
    case 'toBeVisible':
      return {
        step: 'Validar visibilidad',
        descripcion: `Validar que ${sujeto} sea visible en pantalla`,
        expected: `${capitalizar(sujeto)} se muestra correctamente.`,
      };
    case 'toBeHidden':
      return {
        step: 'Validar elemento oculto',
        descripcion: `Validar que ${sujeto} no esté visible`,
        expected: `${capitalizar(sujeto)} no aparece en la pantalla.`,
      };
    case 'toHaveText':
      return {
        step: 'Validar texto exacto',
        descripcion: `Validar que ${sujeto} contenga exactamente el texto ${valorPretty(valor)}`,
        expected: `${capitalizar(sujeto)} muestra el texto ${valorPretty(valor)}.`,
      };
    case 'toContainText':
      return {
        step: 'Validar texto contenido',
        descripcion: `Validar que ${sujeto} contenga el texto ${valorPretty(valor)}`,
        expected: `El texto ${valorPretty(valor)} aparece dentro de ${sujeto}.`,
      };
    case 'toHaveValue':
      return {
        step: 'Validar valor del campo',
        descripcion: `Validar que ${sujeto} tenga el valor ${valorPretty(valor)}`,
        expected: `${capitalizar(sujeto)} contiene el valor ${valorPretty(valor)}.`,
      };
    case 'toHaveCount':
      return {
        step: 'Validar cantidad',
        descripcion: `Validar que aparezcan ${valor} elementos del tipo ${sujeto}`,
        expected: `Aparecen ${valor} elementos del tipo ${sujeto}.`,
      };
    case 'toBeEnabled':
      return {
        step: 'Validar habilitado',
        descripcion: `Validar que ${sujeto} esté habilitado para interactuar`,
        expected: `${capitalizar(sujeto)} está habilitado y responde a la interacción.`,
      };
    case 'toBeDisabled':
      return {
        step: 'Validar deshabilitado',
        descripcion: `Validar que ${sujeto} esté deshabilitado`,
        expected: `${capitalizar(sujeto)} aparece deshabilitado.`,
      };
    case 'toBeChecked':
      return {
        step: 'Validar checkbox tildado',
        descripcion: `Validar que ${sujeto} esté tildado`,
        expected: `${capitalizar(sujeto)} aparece tildado.`,
      };
    default:
      return {
        step: `Validar ${matcher}`,
        descripcion: `Validar (${matcher}) sobre ${sujeto}${valor != null ? ` con valor ${valorPretty(valor)}` : ''}`,
        expected: `${capitalizar(sujeto)} cumple la condición ${matcher}.`,
      };
  }
}

function humanizarVerificar(nodo, sujeto) {
  const cond = nodo.condicion || {};
  const ref = nodo.modo === 'literal'
    ? `el valor literal "${nodo.literal}"`
    : `el valor "${nodo.ref}" capturado previamente`;
  const refCorto = nodo.modo === 'literal' ? `"${nodo.literal}"` : `"${nodo.ref}"`;

  const stepLabels = {
    igual: 'Verificar igualdad',
    distinto: 'Verificar diferencia',
    aumento: 'Verificar aumento',
    disminuyo: 'Verificar disminución',
    aumentoAlMenos: 'Verificar aumento mínimo',
    disminuyoAlMenos: 'Verificar disminución mínima',
  };
  const sufijoUnidad = cond.unidad === 'pct' ? '%' : '';

  const condDesc = {
    igual: `sea igual a ${ref}`,
    distinto: `sea distinto de ${ref}`,
    aumento: `haya aumentado respecto de ${ref}`,
    disminuyo: `haya disminuido respecto de ${ref}`,
    aumentoAlMenos: `haya aumentado al menos ${cond.param}${sufijoUnidad} respecto de ${ref}`,
    disminuyoAlMenos: `haya disminuido al menos ${cond.param}${sufijoUnidad} respecto de ${ref}`,
  };

  // Expected fallback (cuando el QA no escribió mensaje custom): específico por condición.
  const expFallback = {
    igual: `El valor actual de ${sujeto} coincide con ${refCorto}.`,
    distinto: `El valor actual de ${sujeto} difiere de ${refCorto}.`,
    aumento: `El valor actual de ${sujeto} es mayor que ${refCorto}.`,
    disminuyo: `El valor actual de ${sujeto} es menor que ${refCorto}.`,
    aumentoAlMenos: `El valor actual de ${sujeto} es al menos ${cond.param}${sufijoUnidad} mayor que ${refCorto}.`,
    disminuyoAlMenos: `El valor actual de ${sujeto} es al menos ${cond.param}${sufijoUnidad} menor que ${refCorto}.`,
  };

  return {
    step: stepLabels[cond.tipo] || 'Verificar valor',
    descripcion: `Comparar el valor actual de ${sujeto} con ${ref} y verificar que ${condDesc[cond.tipo] || 'cumpla la condición esperada'}`,
    expected: nodo.mensaje || expFallback[cond.tipo] || `${capitalizar(sujeto)} cumple la condición de verificación esperada.`,
  };
}

// ------------------------------------------------------------------------------------
// Construir las filas
// ------------------------------------------------------------------------------------

const filas = [
  ['Test ID', 'Test Name', 'Step Number', 'Step', 'Description', 'Expected Result'],
];
trace.path.forEach((id, idx) => {
  const nodo = nodos[id] || null;
  const h = humanizar(nodo, id);
  filas.push([testIdArg, testNombre, idx + 1, h.step, h.descripcion, h.expected]);
});

// ------------------------------------------------------------------------------------
// Emitir el archivo
// ------------------------------------------------------------------------------------

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const baseName = `${slug}-testId-${testIdArg}-${ts}`;
const outDir = '.autoflow/alm-exports';
mkdirSync(outDir, { recursive: true });

let outPath;
if (formatArg === 'xlsx') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(filas);
  // Anchos sugeridos.
  ws['!cols'] = [
    { wch: 10 }, { wch: 40 }, { wch: 8 }, { wch: 28 }, { wch: 70 }, { wch: 60 },
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
    testId: testIdArg,
    testNombre,
    rows,
  };
  outPath = join(outDir, `${baseName}.json`);
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
}

console.log('');
console.log(`AUTOFLOW_EXPORT: ${JSON.stringify({ ok: true, path: outPath, rows: trace.path.length, format: formatArg })}`);
