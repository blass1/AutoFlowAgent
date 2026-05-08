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
        descripcion: `Se navega a ${url}`,
        expected: 'La página solicitada se carga correctamente y queda lista para interactuar.',
      };
    }
    case 'click':
      return {
        step: 'Click',
        descripcion: `Se hace click en ${sujeto}`,
        expected: 'Se dispara la acción asociada al elemento (navegación, apertura de menú, envío de formulario, etc.).',
      };
    case 'fill':
      // En el modelo, 'fill' es nuestro pressSequentially (acción lógica).
      return {
        step: 'Llenar campo',
        descripcion: `Se ingresa ${valorPretty(nodo.valor)} en ${sujeto}`,
        expected: 'El campo acepta el valor ingresado y queda listo para continuar el flujo.',
      };
    case 'press':
      return {
        step: 'Presionar tecla',
        descripcion: `Se presiona la tecla "${nodo.valor}" en ${sujeto}`,
        expected: 'La tecla dispara su acción asociada (envío de formulario, navegación, salto de campo, etc.).',
      };
    case 'check':
      return {
        step: 'Tildar checkbox',
        descripcion: `Se tilda ${sujeto}`,
        expected: 'El checkbox queda tildado.',
      };
    case 'uncheck':
      return {
        step: 'Destildar checkbox',
        descripcion: `Se destilda ${sujeto}`,
        expected: 'El checkbox queda destildado.',
      };
    case 'selectOption':
      return {
        step: 'Elegir opción',
        descripcion: `Se selecciona ${valorPretty(nodo.valor)} en ${sujeto}`,
        expected: 'La opción queda seleccionada y se aplica al formulario o filtro correspondiente.',
      };
    case 'hover':
      return {
        step: 'Pasar el mouse',
        descripcion: `Se pasa el mouse sobre ${sujeto}`,
        expected: 'El elemento muestra su estado de hover (tooltip, menú desplegable, resaltado, etc.).',
      };
    case 'setInputFiles':
      return {
        step: 'Subir archivo',
        descripcion: `Se selecciona un archivo y se sube en ${sujeto}`,
        expected: 'El archivo queda adjuntado y la interfaz refleja que la carga fue aceptada (nombre del archivo visible, ícono de check, etc.).',
      };
    case 'assert':
      return humanizarAssert(nodo, sujeto);
    case 'capturar':
      return {
        step: 'Capturar valor',
        descripcion: `Se extrae el valor de ${sujeto} y se almacena en la variable "${nodo.varName}"`,
        expected: 'El valor queda guardado en memoria del test para comparar contra él en un paso posterior.',
      };
    case 'verificar':
      return humanizarVerificar(nodo, sujeto);
    default:
      return {
        step: capitalizar(nodo.accion),
        descripcion: `Se ejecuta la acción "${nodo.accion}" sobre ${sujeto}`,
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
      descripcion: `Se valida que ${sujeto} tenga el atributo "${valor}" con valor "${nodo.valorEsperado || ''}"`,
      expected: `El elemento expone el atributo HTML/ARIA con el valor esperado (típicamente refleja un estado: deshabilitado, expandido, seleccionado, etc.).`,
    };
  }

  // toHaveClass puede venir con regex (modoValor === 'regex') o string literal
  if (matcher === 'toHaveClass') {
    if (nodo.modoValor === 'regex') {
      return {
        step: 'Validar clase CSS',
        descripcion: `Se valida que ${sujeto} tenga una clase CSS que matchee con el patrón /${valor}/`,
        expected: 'El elemento incluye en su atributo class un nombre que cumple el patrón esperado, indicando un estado visual (activo, pendiente, error, etc.).',
      };
    }
    return {
      step: 'Validar clase CSS',
      descripcion: `Se valida que ${sujeto} tenga la clase CSS "${valor}"`,
      expected: 'El elemento incluye la clase CSS esperada, indicando un estado visual específico.',
    };
  }

  if (sujeto === 'la página') {
    // Asserts a nivel page (selector="page"): toHaveURL, toHaveTitle.
    if (matcher === 'toHaveURL') {
      return {
        step: 'Validar URL',
        descripcion: `Se valida que la URL del navegador sea ${valorPretty(valor)}`,
        expected: 'La barra de direcciones del navegador muestra la URL esperada.',
      };
    }
    if (matcher === 'toHaveTitle') {
      return {
        step: 'Validar título',
        descripcion: `Se valida que el título de la pestaña sea ${valorPretty(valor)}`,
        expected: 'El título de la pestaña del navegador coincide con el esperado.',
      };
    }
  }

  switch (matcher) {
    case 'toBeVisible':
      return {
        step: 'Validar visibilidad',
        descripcion: `Se valida que ${sujeto} sea visible en pantalla`,
        expected: `${capitalizar(sujeto)} aparece visible en la pantalla, en una ubicación accesible para el usuario.`,
      };
    case 'toBeHidden':
      return {
        step: 'Validar elemento oculto',
        descripcion: `Se valida que ${sujeto} no esté visible`,
        expected: 'El elemento no aparece en la pantalla (o desapareció tras una acción previa).',
      };
    case 'toHaveText':
      return {
        step: 'Validar texto exacto',
        descripcion: `Se valida que ${sujeto} contenga exactamente el texto ${valorPretty(valor)}`,
        expected: 'El elemento muestra exactamente el texto esperado, sin variaciones.',
      };
    case 'toContainText':
      return {
        step: 'Validar texto contenido',
        descripcion: `Se valida que ${sujeto} contenga el texto ${valorPretty(valor)}`,
        expected: 'El texto esperado aparece dentro del contenido del elemento.',
      };
    case 'toHaveValue':
      return {
        step: 'Validar valor del campo',
        descripcion: `Se valida que ${sujeto} tenga el valor ${valorPretty(valor)}`,
        expected: 'El campo contiene el valor esperado.',
      };
    case 'toHaveCount':
      return {
        step: 'Validar cantidad',
        descripcion: `Se valida que aparezcan ${valor} elementos del tipo ${sujeto}`,
        expected: 'La cantidad de elementos visibles coincide con la esperada.',
      };
    case 'toBeEnabled':
      return {
        step: 'Validar habilitado',
        descripcion: `Se valida que ${sujeto} esté habilitado para interactuar`,
        expected: 'El elemento responde a la interacción del usuario (no está deshabilitado/grisado).',
      };
    case 'toBeDisabled':
      return {
        step: 'Validar deshabilitado',
        descripcion: `Se valida que ${sujeto} esté deshabilitado`,
        expected: 'El elemento aparece deshabilitado y no responde a la interacción.',
      };
    case 'toBeChecked':
      return {
        step: 'Validar checkbox tildado',
        descripcion: `Se valida que ${sujeto} esté tildado`,
        expected: 'El checkbox aparece tildado.',
      };
    default:
      return {
        step: `Validar ${matcher}`,
        descripcion: `Se valida (${matcher}) sobre ${sujeto}${valor != null ? ` con valor ${valorPretty(valor)}` : ''}`,
        expected: 'El elemento cumple la condición de validación.',
      };
  }
}

function humanizarVerificar(nodo, sujeto) {
  const cond = nodo.condicion || {};
  const ref = nodo.modo === 'literal'
    ? `el valor literal "${nodo.literal}"`
    : `el valor "${nodo.ref}" capturado anteriormente`;

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
  return {
    step: stepLabels[cond.tipo] || 'Verificar valor',
    descripcion: `Se compara el valor actual de ${sujeto} y se verifica que ${condDesc[cond.tipo] || 'cumpla la condición esperada'}`,
    expected: nodo.mensaje || 'La condición de verificación se cumple según lo esperado por el flujo del negocio.',
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
