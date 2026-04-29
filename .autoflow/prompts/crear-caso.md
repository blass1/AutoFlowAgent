---
mode: agent
description: Lanza una sesión de grabación con codegen y, al cerrarse el browser, dispara el flujo de agrupación de pasos en Page Objects.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Crear caso

## 1. Pedir datos en un solo carousel

Usá `#tool:vscode/askQuestions` con estas preguntas en **una sola llamada** (carousel):

1. `"¿Cómo se llama el caso? (ej: Login con OTP)"` → text input
2. `"¿Qué número tiene? (ej: TC-4521)"` → text input
3. `"¿En qué canal?"` → single-select con:
   - `📱 Mobile Banking`
   - `💻 Home Banking`
   - `🏧 Cajeros`
   - `🆕 Onboarding Digital`
   - `📦 Otro`
4. `"¿Cuál es la URL inicial del flujo?"` → text input

Si en (3) eligió `📦 Otro`, hacé una segunda llamada a `vscode/askQuestions` con un text input: `"¿Cuál es el canal?"`.

Limpiá `numero` (sin espacios extras, mayúsculas consistentes).

## 2. Confirmar

Mostrale al QA el resumen:
```
Vamos a grabar:
  • Nombre:       {nombre}
  • Número:       {numero}
  • Canal:        {canal}
  • URL inicial:  {urlInicial}
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
  "specPath": ".autoflow/recordings/{numero}.spec.ts"
}
```

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

Recién ahora dispará la VSCode task **`autoflow:start-recording`** con `runTasks`. Esa task corre `node scripts/start-recording.js` que lee la sesión activa y lanza `playwright codegen`.

## 6. Cuando vuelve el control

Cuando `runTasks` retorna, el QA cerró el browser y codegen escribió el spec en `{specPath}`. Marcá la sesión como cerrada (`"activa": false`, agregar `"fechaFin": "<iso-ahora>"`) y cargá `.autoflow/prompts/generar-pom.md` para arrancar el flujo de agrupación.
