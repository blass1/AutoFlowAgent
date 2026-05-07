---
mode: agent
description: Lanza una sesión de grabación interactiva en el navegador y, al cerrarse, dispara el flujo de agrupación de pasos en Page Objects.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Crear caso

## 0. ¿De dónde sacamos los datos del caso?

**Si el prompt fue invocado con contexto `origen: "alm"`** (típicamente desde el sub-menú `📄 ALM → Importar .xlsx y crear un Test` del menú principal): **salteá la pregunta** y andá directo al **paso 0.a** asumiendo que el QA ya eligió importar desde Export ALM.

**Si el prompt fue invocado con contexto `origen: "manual"`**: salteá la pregunta y andá directo al **paso 0.b**.

**Sin contexto** (invocación normal desde el menú o desde otro sub-prompt como `editar-caso.md` modo "Regrabar"): preguntale al QA cómo quiere cargar los datos del caso. Usá `#tool:vscode/askQuestions` single-select con la pregunta `"¿Cómo querés cargar los datos del caso?"` y estas opciones:

- `📄 Importar desde Export ALM (.xlsx)`
- `✍️ Cargar manualmente`

### 0.a. Si eligió `📄 Importar desde Export ALM`

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

### 0.b. Si eligió `✍️ Cargar manualmente`

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

> **Si venís del paso 0.a (import ALM)**, ya tenés `nombre` y `numero`. Acá pedí solamente la pregunta 3 (canal), reusando la misma lógica de `data/urls.ts` y `➕ Crear nuevo canal`.

### 1.b. Si eligió `➕ Crear nuevo canal`

Hacé una segunda llamada a `vscode/askQuestions` con dos text inputs en carousel:
1. `"Nombre del canal:"` → text input
2. `"URL inicial del canal (ej: https://...)"` → text input

Validá que el `nombre` no choque con uno ya existente (case-insensitive). Si choca, decilo corto y volvé a pedir.

Agregá el nuevo canal al array `canales` de `data/urls.ts` (insertá un nuevo objeto `{ nombre: '...', url: '...' }` antes del `]` final, manteniendo el formato del resto). Guardá. Usalo como canal seleccionado para este caso.

### 1.c. Si eligió uno existente

Tomá `nombre` y `url` directamente del entry seleccionado. **No preguntes la URL** — ya está.

## 1.5. ¿Arranca logueado?

Listá `.autoflow/auth/*.json` (excluí `.gitkeep`) cuyo nombre arranque con el slug del canal elegido (`{canalSlug}-...`). El slug se calcula como en `setup-auth.md` (kebab-case del nombre del canal).

Si **no hay** archivos de auth para ese canal, salteá este paso silencioso.

Si hay uno o más, abrí `vscode/askQuestions` single-select: `"¿El caso arranca logueado?"`:
- `🔐 Sí, usar el login {userKey}` *(una opción por archivo encontrado)*
- `🚪 No, grabar el login también`

Si elige uno, guardá el path en `authState`. Si elige no, `authState = null`.

## 1.6. ¿Buffer de tiempo entre inputs?

Algunos forms del banco tienen validación on-input que se ejecuta de forma asíncrona y, si el siguiente keystroke llega antes de que termine, se solapan los eventos y la grabación queda inestable (campos que se autocompletan mal, botones que no se habilitan, etc.). El buffer es una espera corta que se inserta **después de cada input** (sea otro input el siguiente paso, o un botón de avanzar/continuar/siguiente) para darle aire a esa validación.

Abrí `vscode/askQuestions` single-select: `"¿Aplicar buffer de 500ms entre inputs?"`:
- `✅ Sí, recomendado para UIs lentas (anti-solape de eventos)`
- `⏭️ No, sin buffer (más rápido pero puede haber solape)`

Guardá la decisión en memoria como `bufferTiempo: true | false`. Va a viajar al `session.json` en el paso 3 y la consume `generar-pom.md` paso 6 al emitir los métodos del **Page Object**.

> Solo se pregunta al **crear** un **Test**. En las opciones que reusan un **Test** existente (añadir pasos, bifurcar, insertar nodo especial), el setting se hereda de la sesión original. Si la sesión original no tiene el campo (Tests viejos), `generar-pom.md` asume `false`.

## 2. Confirmar

Mostrale al QA el resumen:
```
Vamos a grabar:
  • Nombre:        {nombre}
  • Número:        {numero}
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
  "almContext": <ver abajo>
}
```

Si `authState` está seteado, `start-recording.js` lo va a pasar al grabador con `--load-storage` y la grabación arranca con la sesión ya cargada — el QA no graba el login. En `generar-pom.md` el spec generado va a emitir `test.use({ storageState: '<authState>' })` arriba del bloque `test()`.

`almContext` solo se incluye si vino del paso 0.a:
```json
{
  "origen": "alm-export",
  "testId": "<testId del xlsx>",
  "enfoque": "<texto de G2>"
}
```
Si fue carga manual, omití el campo `almContext` directamente (no lo pongas en `null`).

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
