---
mode: agent
description: Lanza una sesión de grabación interactiva en el navegador y, al cerrarse, dispara el flujo de agrupación de pasos en Page Objects.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Crear caso

## 0. ¿De dónde sacamos los datos del caso?

**Si el prompt fue invocado con contexto `origen: "alm-testid"`**: salteá la pregunta y andá directo al **paso 0.a** (import por Test ID).

**Si el prompt fue invocado con contexto `origen: "alm"` o `origen: "alm-xlsx"`** (típicamente desde el sub-menú `📄 ALM-HP → 📥 Importar .xlsx y crear un Test` del menú principal — `"alm"` se mantiene como alias de `"alm-xlsx"` por compatibilidad con invocaciones viejas): salteá la pregunta y andá directo al **paso 0.b** (import xlsx).

**Si el prompt fue invocado con contexto `origen: "manual"`**: salteá la pregunta y andá directo al **paso 0.c** (carga manual).

**Sin contexto** (invocación normal desde el menú o desde otro sub-prompt como `editar-caso.md` modo "Regrabar"): preguntale al QA cómo quiere cargar los datos del caso. Usá `#tool:vscode/askQuestions` single-select con la pregunta `"¿Cómo querés cargar los datos del caso?"` y estas opciones:

- `🆔 Importar caso de ALM con el número de Test ID`
- `📄 Importar caso de ALM utilizando un archivo XLSX`
- `✍️ Cargar datos del Test de manera Manual`

### 0.a. Si eligió `🆔 Importar caso de ALM con el número de Test ID`

Esta opción usa la integración binaria `fetch_test_v1.0.0.exe` para traer el `test_name` + steps registrados del test directamente de ALM por testid.

**Verificación previa**: chequeá que exista el ejecutable con un comando **determinístico** vía `runCommands`. **No uses `file_search` / `codebase` / `search`** — esos tools no indexan archivos binarios (`.exe`, `.dll`, etc.) y devuelven falso negativo aunque el archivo esté ahí. Mismo patrón que `setup-entorno.md` usa para chequear `node_modules`:

```bash
node -e "console.log(require('fs').existsSync('.autoflow/alm/integrations/fetch_test_v1.0.0.exe') ? 'OK' : 'MISSING')"
```

Leé el output con `terminalLastCommand`. Solo seguí el branch de "no existe" si el output contiene literalmente `MISSING`. Cualquier otro output (incluyendo `OK`, errores raros, output vacío) tratalo como **existente** y seguí al fetch. Ante la duda, asumí instalado — el peor caso es que el `runCommands` posterior del exe falle, y ahí caés al manejo de errores normal.

Si **`MISSING`**, avisale al QA y volvé a abrir la pregunta del paso 0:
```
⚠️ No tenés instalada la integración con ALM (.autoflow/alm/integrations/fetch_test_v1.0.0.exe).
Si tu equipo te la pasó, pegala en esa carpeta. Si no, elegí otra opción.
```

Si **existe**, pedí el testid con `vscode/askQuestions` text input:
- `"¿Qué Test ID querés importar? (ej: 668998)"`

Limpiá el input (sin espacios extras). Después corré con `runCommands` (PowerShell):

```powershell
& ".\.autoflow\alm\integrations\fetch_test_v1.0.0.exe" --name {testid}
```

Leé la salida con `terminalLastCommand`. La integración imprime un JSON con esta forma:

```json
{
  "success": true,
  "test_id": "668998",
  "step_count": 9,
  "test_name": "Test Prueba",
  "version": "1.0.0",
  "message": "✓ Obtenidos 9 steps del test 668998",
  "steps": [
    {
      "step-order": "1",
      "name": "Pre-requisitos",
      "description": "Confirmar que el ambiente QA esté disponible...",
      "expected": "- Ambiente QA accesible...",
      "vts": "...", "ver-stamp": "...", "attachment": "",
      "has-params": "N", "vc-user-name": "",
      "id": "8379810", "parent-id": "668998"
    },
    ...
  ]
}
```

**Manejo de errores**:
- Exit code ≠ 0, JSON inválido, o `success: false` → mensaje corto con el error y volvé a abrir la pregunta del paso 0. No reintentes en loop.
- Timeout (>10s) → idem.

**Si `success: true`**:

1. **Guardá una copia del JSON crudo** en `.autoflow/alm/originalTests/{test_id}.json` (sobreescribí si ya existía). Sirve como cache/audit local — la integración no se re-invoca si el agente necesita los datos después.

2. Tomá `nombre = test_name`, `numero = test_id`.

3. **Mostrale al QA un resumen** con los datos del test + los steps. De cada step emití solo `name`, `description` y `expected` — el resto de campos no le interesan al QA:
   ```
   📥 Encontré el test en ALM:
     • Test ID: {test_id}
     • Nombre:  "{test_name}"

   Steps registrados ({step_count}):
     1. {steps[0].name}
        → {steps[0].description}
        ✅ Esperado: {steps[0].expected}

     2. {steps[1].name}
        → {steps[1].description}
        ✅ Esperado: {steps[1].expected}

     ...
   ```

4. **Confirmá el nombre** con `vscode/askQuestions` single-select: `"¿Usás este nombre o lo cambiás?"`:
   - `✅ Usar "{test_name}"` → seguí con ese nombre.
   - `✏️ Cambiar nombre` → text input para que pegue uno nuevo. Reemplazá `nombre` con lo que tipee.

> **Por ahora el agente NO usa los steps para construir el caso**. Son puramente informativos para que el QA tenga a la vista qué tiene que grabar (la grabación arranca limpia en el paso 5 como siempre). En versiones futuras de la integración se podrían usar para validar consistencia post-grabación.

Saltá directamente al **paso 1.canal** (solo preguntar canal). El `test_id` se persiste en `almContext` en el paso 3.

### 0.b. Si eligió `📄 Importar caso de ALM utilizando un archivo XLSX`

Antes de pedir el archivo, **decile al QA dónde dejarlo** con un mensaje corto:

```
📂 Guardá el .xlsx exportado de ALM en la carpeta:
   .autoflow/alm-exports/

Después escribime solo el nombre del archivo (ej: caso-4521.xlsx)
o, si preferís, pegá la ruta absoluta completa.
```

Si la carpeta `.autoflow/alm-exports/` no existe, creala antes de mostrar el mensaje.

Después llamá a `vscode/askQuestions` con un text input:
1. `"Nombre del archivo en .autoflow/alm-exports/ (o ruta completa)"` → text input

Corré con `runCommands`:
```
node .autoflow/scripts/parse-alm-export.js "<entrada>"
```

> El script busca primero la ruta tal cual la pasaste, después en `.autoflow/alm-exports/`, y si no tiene `.xlsx` lo agrega. Así el QA puede tipear `caso-4521`, `caso-4521.xlsx` o una ruta absoluta y todas funcionan.

El script imprime una sola línea JSON. Parseala:
- Si `ok: false` → mostrale el `error` corto al QA y volvé a preguntar opción 0 (importar de nuevo o pasar a manual). No reintentes en loop.
- Si `ok: true` → tenés `{ testId, nombre, enfoque }`. Guardalos en memoria como datos del caso, donde:
  - `numero = testId`
  - `nombre = nombre` (ya viene limpio del script)
  - `enfoque = enfoque` (puede ser `""`)

Mostrale al QA un mini-resumen y un confirm:
```
Importé del ALM:
  • Test ID: {testId}
  • Nombre:  {nombre}
  • Enfoque: {primeros 120 chars de enfoque o "(vacío)"}
```
Single-select: `"¿Está bien lo que importé?"`
- `✅ Sí, seguir con el canal`
- `✏️ Editar nombre/numero a mano`

Si elige editar, abrí un carousel con dos text inputs prefillados (`nombre`, `numero`) para que los corrija. **No** vuelvas a preguntar el `enfoque` — se conserva tal cual vino.

Saltá directamente al **paso 1.canal** (solo preguntar canal). El `enfoque` queda guardado para escribirlo en la session en el paso 3.

### 0.c. Si eligió `✍️ Cargar datos del Test de manera Manual`

Seguí con el flujo tradicional desde el paso 1.

## 1. Pedir datos en un solo carousel (modo manual)

Antes del carousel, leé `data/urls.ts`. Exporta `canales: readonly Canal[]` con la forma:
```ts
export const canales: readonly Canal[] = [
  { nombre: 'Demoblaze', url: 'https://www.demoblaze.com/' },
];
```
Si el archivo no existe o el array está vacío, tratalo como lista vacía.

Usá `#tool:vscode/askQuestions` con estas preguntas en **una sola llamada** (carousel):

1. `"¿Cómo se llama el caso? (ej: Login con OTP)"` → text input
2. `"¿Qué número tiene? (testId, ej: 43213)"` → text input
3. `"¿En qué canal?"` → single-select. Las opciones se arman **dinámicamente** desde `data/urls.ts`:
   - Una opción por cada canal guardado, mostrando `{nombre} — {url}`.
   - Al final, siempre: `➕ Crear nuevo canal`.

Limpiá `numero` (sin espacios extras, mayúsculas consistentes).

> **Si venís del paso 0.a (testid) o del paso 0.b (xlsx)**, ya tenés `nombre` y `numero`. Acá pedí solamente la pregunta 3 (canal), reusando la misma lógica de `data/urls.ts` y `➕ Crear nuevo canal`.

### 1.b. Si eligió `➕ Crear nuevo canal`

Hacé una segunda llamada a `vscode/askQuestions` con dos text inputs en carousel:
1. `"Nombre del canal:"` → text input
2. `"URL inicial del canal (ej: https://...)"` → text input

Validá que el `nombre` no choque con uno ya existente (case-insensitive). Si choca, decilo corto y volvé a pedir.

Agregá el nuevo canal al array `canales` de `data/urls.ts` (insertá un nuevo objeto `{ nombre: '...', url: '...' }` antes del `]` final, manteniendo el formato del resto). Guardá. Usalo como canal seleccionado para este caso.

### 1.c. Si eligió uno existente

Tomá `nombre` y `url` directamente del entry seleccionado. **No preguntes la URL** — ya está.

## 1.4. ¿A qué Test Set pertenece este Test?

> **Si vino contexto** con `testSetSlug` ya definido (ej: `editar-caso.md` modo "Regrabar" reusa el set del Test fuente; futura integración que setee `testSetSlug` antes de invocar `crear-caso.md`): **salteá este paso**. Tomá `testSetSlug`, `testSetId`, `testSetNombre` del contexto y andá al paso 1.5.

> **Por qué se pregunta acá** (después del Test, antes de auth/buffer): el Test es la entidad obligatoria; el Test Set es asociación. Hoy se pregunta acá pero el lugar está pensado para que en el futuro una integración pueda completarlo automáticamente y saltar la pregunta.

Listá `.autoflow/testsets/*.json` (excluí `.gitkeep`). Cargá cada uno con `leerJsonSeguro` y extraé `{ slug, id, nombre }`.

Abrí `vscode/askQuestions` single-select: `"¿A qué Test Set pertenece este Test?"`:

- Una opción por cada Test Set existente, mostrando `📦 {nombre} [testSetId:{id}]`.
- Al final, siempre: `➕ Crear un Test Set nuevo`.

### 1.4.a. Si eligió uno existente

Tomá `testSetSlug = set.slug`, `testSetId = set.id`, `testSetNombre = set.nombre` directamente. Andá al paso 1.5.

### 1.4.b. Si eligió `➕ Crear un Test Set nuevo`

`vscode/askQuestions` carousel con 3 text inputs:

1. `"Nombre del Test Set (ej: Dolar MEP en CA / CC)"` → text input.
2. `"testSetId (número único, ej: 99001)"` → text input.
3. `"Descripción corta (1 línea — qué cubre el set)"` → text input.

**Validaciones**:
- `nombre` no vacío.
- `testSetId` numérico, no vacío, no debe chocar contra `id` de algún testset existente. Si choca, decilo corto y volvé a pedir.
- `slug` se calcula del nombre como kebab-case (lower-case, espacios → `-`, sin caracteres especiales). No debe chocar contra `slug` de algún testset existente. Si choca, sumá un sufijo numérico (`{slug}-2`).
- `descripcion` puede ser vacía pero recomendá completarla.

**Crear el JSON** `.autoflow/testsets/{slug}.json` con shape mínimo:
```json
{
  "slug": "{slug}",
  "id": "{testSetId}",
  "nombre": "{nombre}",
  "descripcion": "{descripcion}",
  "specPath": "tests/{slug}-{testSetId}.spec.ts",
  "casos": []
}
```

> El campo `specPath` queda anticipado a nivel raíz (la convención correcta — ver `pom-rules.md`). El array `casos` arranca vacío; el Test recién grabado se le agrega en `generar-pom.md` paso 8 al cierre.

**No** crear todavía el archivo `tests/{slug}-{testSetId}.spec.ts` — ese lo escribe `generar-pom.md` paso 8 cuando ya tiene los POMs listos. El JSON del testset queda "huérfano" (sin Tests) hasta que se complete la grabación + agrupación. Si el QA cancela, el set queda creado vacío y se puede reusar después.

Anotá `testSetSlug`, `testSetId`, `testSetNombre` en memoria para los siguientes pasos.

## 1.5. ¿Arranca logueado?

Listá `.autoflow/auth/*.json` (excluí `.gitkeep`) cuyo nombre arranque con el slug del canal elegido (`{canalSlug}-...`). El slug se calcula como en `setup-auth.md` (kebab-case del nombre del canal).

Si **no hay** archivos de auth para ese canal, salteá este paso silencioso.

Si hay uno o más, abrí `vscode/askQuestions` single-select: `"¿El caso arranca logueado?"`:
- `🔐 Sí, usar el login {userKey}` *(una opción por archivo encontrado)*
- `🚪 No, grabar el login también`

Si elige uno, guardá el path en `authState`. Si elige no, `authState = null`.

## 1.6. ¿Buffer de tiempo entre acciones?

Algunos forms del banco tienen validación on-input asíncrona y, si el siguiente keystroke o click llega antes de que termine, los eventos se solapan: campos que se autocompletan mal, botones que no se habilitan, **checkboxes/toggles que no se seleccionan bien si se clickean en sucesión rápida**. El buffer es una espera corta de 500ms que se inserta **después de cada acción de input o selección** (`pressSequentially`, `click`, `check`, `uncheck`, `selectOption`) para darle aire al front.

Abrí `vscode/askQuestions` single-select: `"¿Aplicar buffer de 500ms entre acciones?"`:
- `✅ Sí, recomendado para UIs lentas (anti-solape de eventos y selecciones)`
- `⏭️ No, sin buffer (más rápido pero puede haber solape)`

Guardá la decisión en memoria como `bufferTiempo: true | false`. Va a viajar al `session.json` en el paso 3 y la consume `generar-pom.md` paso 6 al emitir los métodos del **Page Object**.

> Solo se pregunta al **crear** un **Test**. En las opciones que reusan un **Test** existente (añadir pasos, bifurcar, insertar nodo especial), el setting se hereda de la sesión original. Si la sesión original no tiene el campo (Tests viejos), `generar-pom.md` asume `false`.

## 2. Confirmar

Mostrale al QA el resumen:
```
Vamos a grabar:
  • Nombre:        {nombre}
  • Número:        {numero}
  • Test Set:      {testSetNombre} [testSetId:{testSetId}]{(nuevo) si se creó en 1.4.b}
  • Canal:         {canal.nombre}
  • URL inicial:   {canal.url}
  • Login previo:  {authState ? userKey : "no, grabamos desde cero"}
  • Buffer 500ms:  {bufferTiempo ? "sí (anti-solape)" : "no"}
```

Después abrí `vscode/askQuestions` single-select: `"¿Confirmás los datos?"` con:
- `✅ Sí, lanzar recorder`
- `✏️ Corregir algo`

Si elige corregir, volvé al paso 1 (preservá los valores actuales como contexto si podés).

## 3. Crear el archivo de sesión

Leé `.autoflow/user.json` y escribí:

**`.autoflow/recordings/{numero}-session.json`**:
```json
{
  "activa": true,
  "nombre": "<nombre>",
  "numero": "<numero>",
  "canal": "<canal>",
  "urlInicial": "<urlInicial>",
  "qa": <contenido completo de user.json>,
  "fechaInicio": "<iso-ahora>",
  "specPath": ".autoflow/recordings/{numero}.spec.ts",
  "authState": <ruta al .json de auth si vino del paso 1.5, sino omitido>,
  "bufferTiempo": <true|false según paso 1.6>,
  "testSet": {
    "slug": "<testSetSlug>",
    "id": "<testSetId>",
    "nombre": "<testSetNombre>",
    "creadoEnEstaSesion": <true si vino de 1.4.b crear-nuevo, sino false>
  },
  "almContext": <ver abajo>
}
```

> El bloque `testSet` viene del paso 1.4. Lo lee `generar-pom.md` paso 7 para saber a qué set asociar el Test sin re-preguntar. El flag `creadoEnEstaSesion` permite (a futuro) que cancel/cleanup borre sets huérfanos si el QA lo pide; por ahora se persiste como info para auditoría, sin cleanup automático.

Si `authState` está seteado, `start-recording.js` lo va a pasar al grabador con `--load-storage` y la grabación arranca con la sesión ya cargada — el QA no graba el login. En `generar-pom.md` el spec generado va a emitir `test.use({ storageState: '<authState>' })` arriba del bloque `test()`.

`almContext` solo se incluye si vino del paso 0.a (testid) o del paso 0.b (xlsx):

**Si vino del paso 0.a (testid)**:
```json
{
  "origen": "alm-testid",
  "testId": "<test_id del JSON>"
}
```

**Si vino del paso 0.b (xlsx)**:
```json
{
  "origen": "alm-export",
  "testId": "<testId del xlsx>",
  "enfoque": "<texto de G2>"
}
```

Si fue carga manual (paso 0.c), omití el campo `almContext` directamente (no lo pongas en `null`).

> No se crean archivos de markers ni notes. Durante la grabación el QA no interactúa con el chat.

## 4. Mensaje al QA (ANTES de lanzar la task)

**Importante**: mandá este mensaje **antes** de disparar la task. `runTasks` bloquea al agente hasta que el grabador termina, y eso es justamente lo que queremos: cuando vuelva el control, el navegador ya está cerrado y arrancamos la agrupación.

```
🎬 Voy a abrir el navegador para que grabes el flujo. En unos segundos vas a ver
una ventana de Chromium con el Inspector de Playwright.

Navegá tu flujo end-to-end y, cuando termines, **cerrá el browser**. Ahí
vuelvo yo y te muestro los pasos capturados para que los agrupemos en pages.

Mientras grabás no hace falta que me escribas — esperá a cerrar el browser.
```

## 5. Lanzar el grabador

Recién ahora dispará la VSCode task **`autoflow:start-recording`** con `runTasks`. Esa task corre `node .autoflow/scripts/start-recording.js` que lee la sesión activa y lanza el grabador interactivo.

## 6. Cuando vuelve el control — CONFIRMAR antes de procesar

Cuando `runTasks` retorna, **NO procedas directamente**. `runTasks` puede retornar antes de que el QA termine de grabar (depende del IDE, del setup de Copilot, o de que el QA haya cerrado el inspector pero no la ventana del browser). Si arrancás a procesar mientras el QA todavía está grabando, los pasos quedan partidos a la mitad y se rompe la generación.

Siempre **confirmá explícitamente** con el QA antes de seguir.

Abrí `vscode/askQuestions` single-select: `"¿Ya terminaste de grabar el flujo completo y cerraste el browser?"`:
- `✅ Sí, procesá los pasos`
- `🔁 No, todavía estoy grabando — esperame`

### Si responde `🔁 No`

Mostrale un mensaje corto:
```
OK, te espero. Cuando termines:
  1. Volvé al browser de Chromium / al Inspector de Playwright.
  2. Navegá lo que falte del flujo.
  3. Cerrá la ventana del browser.
  4. Volvé al chat y avisame que terminaste.
```

Volvé a abrir el mismo `vscode/askQuestions`. Repetí en bucle hasta que confirme `✅ Sí`. **No avancés bajo ninguna circunstancia mientras la respuesta sea "No"** — un Test corrupto cuesta más tiempo que la espera.

### Si responde `✅ Sí`

1. **Verificá que el spec existe con el script estructurado** (no con tu tool genérica de lectura — tiene falsos negativos por race conditions de filesystem en Windows). Ejecutá con `runCommands`:

   ```
   node .autoflow/scripts/verificar-recording.js {numero}
   ```

   El script imprime una línea `AUTOFLOW_RECORDING: { ok, path, tamaño, listado, razon? }`. Leela con `terminalLastCommand`.

   - **Si `ok: true`** → seguí al punto 2.
   - **Si `ok: false`** → **retry**: esperá ~1.5s (con `runCommands`: `node -e "setTimeout(() => {}, 1500)"`) y volvé a correr el script. Hasta **3 reintentos**. Codegen en Windows a veces cierra el proceso antes de que el filesystem flushee el archivo, y el chequeo inmediato da falso negativo.
   - **Si después de 3 reintentos sigue `ok: false`** → mostrale al QA el listado completo que devolvió el script + el path que estaba chequeando:

     ```
     ⚠️ No encuentro el archivo de la grabación.

     Esperaba: {path}
     Lo que veo en .autoflow/recordings/:
       • {listado[0]}
       • {listado[1]}
       • ...

     Si vos ves el archivo en tu explorador y yo no, puede ser un desync —
     mirá si el nombre coincide con "{numero}.spec.ts" o si tiene otro número.
     ```

     Después abrí `vscode/askQuestions` single-select:
     - `✅ Confirmo que el archivo está, seguí` → asumí que existe (probablemente un edge case del filesystem) y seguí al punto 2. Si después en el paso 2 (parsear la grabación) falla, ahí sí frená.
     - `🔁 Relanzar la grabación` → volvé al paso 5.
     - `❌ Cancelar` → marcá `activa: false` con `cancelado: true` y volvé al menú.

2. Marcá la sesión como cerrada en `{numero}-session.json`: `"activa": false` + `"fechaFin": "<iso-ahora>"`.
3. Cargá `.autoflow/prompts/generar-pom.md` para arrancar el flujo de agrupación.
