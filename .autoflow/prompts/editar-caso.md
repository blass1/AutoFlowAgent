---
mode: agent
description: Edita un Test existente — regrabar desde cero, abrir el código, o añadir pasos al final.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Editar Test

> **Glosario rápido (objetos manipulables)**: **Test Set** = agrupador de **Tests** (un archivo `tests/{slug}-{id}.spec.ts` con varios `test()` adentro envueltos en un `test.describe`). **Test** = un `test('...')` puntual dentro del spec (lo que el QA llama "caso"). **Page Object** = clase en `pages/`. **Nodo** = acción atómica del flujo. Donde diga **Test Set**, **Test**, **Page Object** o **Nodo** en los mensajes al QA, mantenelo en negrita.

## 1. Elegir Test Set

Leé todos los `.json` en `.autoflow/testsets/`. Para los archivos de `tests/` que no estén en ningún set, sumá la opción "Tests sueltos".

Usá `#tool:vscode/askQuestions` single-select: `"¿De qué **Test Set**?"` con opciones:
- `📦 {nombre del set 1}`
- `📦 {nombre del set 2}`
- ...
- `📂 Tests sueltos (sin **Test Set**)`

Si no hay ningún **Test Set**, saltá este paso y pasá directo al paso 2 con la lista de **Tests** sueltos.

## 2. Elegir Test

Leé los **Tests** del set elegido (o los sueltos). Para cada bloque `test()` dentro del archivo, extraé el nombre del test (parámetro de `test('...')`).

Usá `vscode/askQuestions` single-select: `"¿Qué **Test**?"` con cada uno como opción:
- `✏️ Compra de dolar mep con CA [testId:43213]`
- `✏️ Compra de dolar mep con CC [testId:43214]`
- ...

## 3. Acción a tomar

Usá `vscode/askQuestions` single-select: `"¿Qué hacés con el **Test** [testId:{numero}]?"`:
- `🔄 Regrabar desde cero`
- `📝 Editar el código manualmente`
- `➕ Añadir pasos al final del **Test**`
- `🎯 Insertar **Nodo** de captura/verificación`
- `🎯 Acción filtrada en lista (click+submenú o validar existencia/no-existencia de fila)`
- `📅 Elegir fecha en date picker (parametrizada — no hardcodeada)`
- `📸 Insertar screenshot en un paso (captura JPEG para evidencia del PDF)`
- `🍴 Bifurcar **Test** desde un **Nodo** (crear Test nuevo a partir de éste)`

### Opción `🔄 Regrabar desde cero`

1. Leé `tests/{archivo}.spec.ts` y extraé URL inicial (primer `page.goto`).
2. Inferí `nombre`, `numero`, `canal` del nombre/contenido del archivo.
3. Resolvé el **Test Set** del Test fuente: del filename `tests/{slug}-{testSetId}.spec.ts` sacá el `slug` y leé `.autoflow/testsets/{slug}.json` para tener `{ slug, id, nombre }`.
4. Confirmá los datos con `vscode/askQuestions` single-select `"¿Va con estos datos?"`:
   - `✅ Sí, regrabar`
   - `✏️ Cambiar algo`
5. Si confirma, delegá a `crear-caso.md` desde el paso 3, **pasando contexto** con `nombre`, `numero`, `canal`, `urlInicial`, **y `testSet: { slug, id, nombre, creadoEnEstaSesion: false }`**. Con eso `crear-caso.md` paso 1.4 se saltea (ya tiene el set) y la regrabación arranca limpia sin re-preguntar nada.

### Opción `📝 Editar el código manualmente`

1. Leé `tests/{archivo}.spec.ts` y extraé los `import` que apunten a `pages/...`.
2. Resolvé los paths a archivos.
3. Ejecutá con `runCommands`:
   ```
   code -r tests/{archivo}.spec.ts pages/{po1}.ts pages/{po2}.ts ...
   ```
4. Decile al QA: `Te abrí el test y los Page Objects relacionados.`

### Opción `➕ Añadir pasos al final del Test`

`vscode/askQuestions` single-select: `"¿Cómo añadís los pasos al **Test**?"`:
- `🎬 Regrabar todo desde cero` → flujo clásico con el grabador.
- `🧱 Construir paso a paso (HTML + acción)` → flujo manual sin volver a navegar.

#### Modo `🎬 Regrabar todo desde cero`

1. Marcá en `.autoflow/recordings/{numero}-session.json` el campo `"modo": "append"` (es el flag interno del flujo de añadir pasos; mantenerlo en código).
2. Inferí URL final del **Test** (último `page.goto` o estado tras la última acción) y lanzá el grabador apuntando ahí.
3. **Confirmá explícitamente que terminó de grabar antes de procesar**. Cuando `runTasks` / `runCommands` retorna, NO cargues `generar-pom.md` directo: el control puede volver antes de que el QA cierre el browser. Abrí `vscode/askQuestions` single-select: `"¿Ya terminaste de grabar y cerraste el browser?"` con opciones `✅ Sí, procesá los pasos` / `🔁 No, todavía estoy grabando — esperame`. Si elige `No`, mostrale un mensaje corto pidiendo que termine + cerrar el browser, y reabrí el mismo single-select. Bucle hasta que confirme `Sí`.
4. Recién con la confirmación `Sí`, cargá `.autoflow/prompts/generar-pom.md`. Detecta el `modo: "append"` y entra al **Bloque AÑADIR PASOS** (matchea **Page Objects** existentes, mergea al spec sin regenerar POMs).

#### Modo `🧱 Construir paso a paso (HTML + acción)`

Cargá [.autoflow/prompts/append-manual.md](append-manual.md) pasándole `numero` y la ruta del spec del caso elegido. Ese sub-prompt arma cada paso nuevo a partir del HTML que pega el QA y la acción que elige, sin re-navegar la web.

### Opción `🎯 Insertar Nodo de captura/verificación`

Cargá [insertar-nodo-especial.md](insertar-nodo-especial.md) pasándole `numero` y la ruta del spec del **Test** elegido. Ese sub-prompt maneja toda la interacción y la edición de archivos.

### Opción `🎯 Acción filtrada en lista`

Cargá [accion-en-lista.md](accion-en-lista.md) pasándole `numero` y la ruta del spec del **Test** elegido. Ese sub-prompt construye operaciones sobre items específicos de listas/tablas filtrando por contenido (no por posición), parametrizando los criterios como args del método. Soporta tres tipos: click + submenú (típico para 3-puntitos + Cancelar), validar que la fila existe, validar que la fila NO existe.

### Opción `📅 Elegir fecha en date picker`

Cargá [elegir-fecha-en-picker.md](elegir-fecha-en-picker.md) pasándole `numero` y la ruta del spec. Ese sub-prompt construye un método del PO que elige una fecha en un date picker, **parametrizado por la fecha** (no clavada al día capturado por el grabador). Soporta input nativo `<input type="date">`, calendario custom con navegación de meses, y typeable con dropdown de sugerencias. La fecha viene del data file, calculada al vuelo (hoy, +30 días, etc.) o como literal.

### Opción `📸 Insertar screenshot en un paso`

Cargá [insertar-screen.md](insertar-screen.md) pasándole `numero` y la ruta del spec del **Test** elegido. Ese sub-prompt lista los pasos del **Test** numerados, deja al QA elegir uno + dar un label, e inserta `await screen(this.page, '{label}')` en el método del PO correspondiente. Registra también el nodo `capturar-screen` en `nodos.json` y en el sidecar de la page. El screen se va a tomar durante la próxima corrida del **Test** y quedar en `runs/{ts}/screens/{testId}/{label}_DD_MM_YYYY_HH_MM_SS.jpg`, donde lo levanta el reporte PDF como evidencia.

### Opción `🍴 Bifurcar Test desde un Nodo`

Cargá [bifurcar-caso.md](bifurcar-caso.md) pasándole `numeroFuente: numero`. Ese sub-prompt arma el warm-up con storageState, lanza el grabador para grabar la cola, y materializa el **Test** nuevo reusando el prefix de Page Objects + datos del **Test** fuente.

## 4. Volver al menú

Después de cualquier opción, abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"` con:
- `✏️ Editar otro **Test**`
- `🏠 Volver al menú`
