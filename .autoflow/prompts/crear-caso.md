---
mode: agent
description: Lanza una sesión de grabación con codegen y, al cerrarse el browser, dispara el flujo de agrupación de pasos en Page Objects.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Crear caso

## 0. ¿De dónde sacamos los datos del caso?

Antes que nada, preguntale al QA cómo quiere cargar los datos del caso. Usá `#tool:vscode/askQuestions` single-select con la pregunta `"¿Cómo querés cargar los datos del caso?"` y estas opciones:

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

Antes del carousel, leé `.autoflow/urls/urls.json`. Tiene la forma:
```json
{
  "canales": [
    { "nombre": "Demoblaze", "url": "https://www.demoblaze.com/" }
  ]
}
```
Si el archivo no existe o `canales` está vacío, tratalo como lista vacía.

Usá `#tool:vscode/askQuestions` con estas preguntas en **una sola llamada** (carousel):

1. `"¿Cómo se llama el caso? (ej: Login con OTP)"` → text input
2. `"¿Qué número tiene? (ej: TC-4521)"` → text input
3. `"¿En qué canal?"` → single-select. Las opciones se arman **dinámicamente** desde `urls.json`:
   - Una opción por cada canal guardado, mostrando `{nombre} — {url}`.
   - Al final, siempre: `➕ Crear nuevo canal`.

Limpiá `numero` (sin espacios extras, mayúsculas consistentes).

> **Si venís del paso 0.a (import ALM)**, ya tenés `nombre` y `numero`. Acá pedí solamente la pregunta 3 (canal), reusando la misma lógica de `urls.json` y `➕ Crear nuevo canal`.

### 1.b. Si eligió `➕ Crear nuevo canal`

Hacé una segunda llamada a `vscode/askQuestions` con dos text inputs en carousel:
1. `"Nombre del canal:"` → text input
2. `"URL inicial del canal (ej: https://...)"` → text input

Validá que el `nombre` no choque con uno ya existente (case-insensitive). Si choca, decilo corto y volvé a pedir.

Agregá el nuevo canal al array `canales` de `.autoflow/urls/urls.json` y guardá. Usalo como canal seleccionado para este caso.

### 1.c. Si eligió uno existente

Tomá `nombre` y `url` directamente del entry seleccionado. **No preguntes la URL** — ya está.

## 2. Confirmar

Mostrale al QA el resumen:
```
Vamos a grabar:
  • Nombre:       {nombre}
  • Número:       {numero}
  • Canal:        {canal.nombre}
  • URL inicial:  {canal.url}
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
  "almContext": <ver abajo>
}
```

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

**Importante**: mandá este mensaje **antes** de disparar la task. `runTasks` bloquea al agente hasta que `playwright codegen` termina, y eso es justamente lo que queremos: cuando vuelva el control, el browser ya está cerrado y arrancamos la agrupación.

```
🎬 Voy a lanzar codegen. En unos segundos vas a ver una ventana de Chromium
y el Inspector de Playwright.

Navegá tu flujo end-to-end y, cuando termines, **cerrá el browser**. Ahí
vuelvo yo y te muestro los pasos capturados para que los agrupemos en pages.

Mientras grabás no hace falta que me escribas — esperá a cerrar el browser.
```

## 5. Lanzar codegen

Recién ahora dispará la VSCode task **`autoflow:start-recording`** con `runTasks`. Esa task corre `node .autoflow/scripts/start-recording.js` que lee la sesión activa y lanza `playwright codegen`.

## 6. Cuando vuelve el control

Cuando `runTasks` retorna, el QA cerró el browser y codegen escribió el spec en `{specPath}`. Marcá la sesión como cerrada (`"activa": false`, agregar `"fechaFin": "<iso-ahora>"`) y cargá `.autoflow/prompts/generar-pom.md` para arrancar el flujo de agrupación.
