---
mode: agent
description: Sub-flow surgical de reparación post-fallo. Parsea el output de Playwright, identifica el nodo concreto que rompió y ofrece reparación dirigida. Cae a `actualizar-nodos.md` (multi-select manual) cuando no puede identificar el nodo.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Reparar tras un Test fallido (surgical)

Sub-flow unificado de reparación post-fallo. Lo invocan los 3 flujos que corren Tests:

- `generar-pom.md` paso 11 (smoke post-grabación que falló)
- `correr-caso.md` paso 4 (Test individual que falló)
- `correr-test-set.md` paso 4 (un Test del set que falló)

**Por qué existe**: antes cada flujo tenía su propia estrategia de reparación. `generar-pom` ofrecía un flow **surgical** (parsear error → identificar nodo → reparar dirigido). Los otros dos ofrecían un flow **adivinatorio** (mostrar todos los nodos del Test, pedirle al QA que tildee cuál cree que rompió). Este sub-prompt unifica: intenta surgical primero; si no puede identificar el nodo, cae al adivinatorio (`actualizar-nodos.md`).

## Inputs

- `specPath` — ruta del spec del Test fallido (`tests/{slug}-{id}.spec.ts`).
- `testId` — testId del Test (`numero`).
- `mode` — `'smoke'` | `'run-test'` | `'run-testset'`. Solo afecta el wording de los mensajes; la lógica es la misma.

## 1. Parsear el output de Playwright

Leé el output del comando que corrió Playwright con `terminalLastCommand`. Buscá las últimas ~40 líneas y extraé:

- **Selector que falló** — típico patrón `Locator: <selectorRaw>` o `waiting for locator(<selectorRaw>)`. Capturá el `selectorRaw` exacto (texto que va entre `Locator:` y el siguiente `\n` o entre `waiting for ` y el resto de la línea).
- **Archivo + línea del PO** — patrón `pages/{Nombre}Page.ts:NN` o `at .../pages/{Nombre}Page.ts:NN:CC`.
- **Mensaje del matcher** — `element(s) not found`, `expected to be visible`, `Timeout 30000ms exceeded`, `Test timeout of NNNNms exceeded`, etc.
- **Step donde rompió** (opcional) — el `test.step('...', ...)` que envolvía la acción que falló.

## 2. Cruzar el selectorRaw con `nodos.json`

Cargá `.autoflow/nodos.json`. Buscá el nodo cuyo `selectorRaw` coincida **exactamente** con el extraído (whitespace normalizado).

- Si encontrás **uno solo** → ese es el nodo afectado. Anotá su `id`. Andá al paso 3 (modo surgical).
- Si encontrás **varios** (mismo selector usado en distintas pages) → preferí el que pertenezca a una page que aparece en `.autoflow/recordings/{testId}-path.json`. Si todavía hay ambigüedad, andá al paso 3 mostrando los candidatos.
- Si no encontrás **ninguno** → no podés identificar el nodo. **Caé al paso 5 (fallback adivinatorio)**.

## 3. Modo surgical — mostrar contexto al QA

Mostrale al QA el diagnóstico:

```
❌ El Test [testId:{testId}] falló.

  Step:            {stepName si lo tenés, sino "—"}
  Locator que rompió:  {selectorRaw}
  Page object:         {Nombre}Page (línea {linea})
  Razón:               {mensaje del matcher}
  Nodo afectado:       {id del nodo}
```

`vscode/askQuestions` single-select: `"¿Qué hacemos con este nodo?"`:

- `🪄 Reparar con Auto-Health Node (recomendado)` → cargá `.autoflow/prompts/auto-health-node.md` con contexto `{ nodoId: <id>, motivo: 'test-fallido', testIdContext: <testId> }`. Auto-Health navega el flujo hasta el paso anterior, captura el DOM, y propone un locator más confiable razonando sobre el HTML real.
- `✏️ Pegar locator a mano` → cargá `actualizar-nodos.md` con `{ specPath, numeroTC: testId, nodoIdForzado: <id> }`. El sub-prompt salta el multi-select del paso 3 y va directo al paso 4 para ese nodo específico.
- `🔄 Re-correr el Test` → por si fue flaky (UI lenta, dialog que el QA no aceptó a tiempo, race condition transitoria). Ejecutá el mismo comando que el caller. Si vuelve a fallar, **NO ofrezcas esta opción una segunda vez** — pasá al fallback.
- `🔍 Ver el error completo` → mostrá las últimas ~30 líneas del output. Al volver, reabrí este single-select.
- `🧩 Elegir otro Nodo a reparar manualmente` → cargá `actualizar-nodos.md` con el multi-select completo (modo legacy). Útil si el nodo que el agente identificó no es el real (raro pero puede pasar con asserts encadenados).
- `📝 Abrir el Test en VSCode para editar a mano` → solo en `mode: 'run-test'` o `'run-testset'` (no en `'smoke'`). Comando: `code -g {specPath}:1`.
- `🏠 Volver al menú principal` → mostrá un warning corto: `⚠️ El Test queda commiteable pero rojo.`

## 4. Después de reparar — re-correr

Si el QA ejecutó Auto-Health o pegado a mano y volvió acá con un nodo arreglado:

1. Mostrá `✓ Nodo reparado: {nuevoLocator}`.
2. Ofrecé re-correr el Test automáticamente con el mismo comando del caller. Si pasa → `✅ Reparado, el Test pasa.` Si vuelve a fallar → volvé al paso 1 (parsear el nuevo output) para identificar el nodo que rompe ahora. Tras 2 iteraciones sin éxito, ofrecé `🏠 Volver al menú` como salida.

## 5. Fallback adivinatorio (cuando no podés identificar el nodo)

Cuando el paso 2 no encuentra match en `nodos.json` (puede pasar con asserts inline en el spec, errores de syntax en el PO, timeouts genéricos sin selector específico), mostrá al QA:

```
⚠️ No pude identificar el Nodo específico que rompió a partir del output.

Razón posible: {mensaje del matcher}
```

`vscode/askQuestions` single-select: `"¿Qué hacemos?"`:

- `🧩 Elegir Nodo(s) a reparar manualmente` → cargá `actualizar-nodos.md` con `{ specPath, numeroTC: testId }`. Va al multi-select completo.
- `🔄 Re-correr el Test` → idem paso 3, máximo una vez.
- `🔍 Ver el error completo` → mostrá las últimas ~30 líneas. Al volver, reabrí este single-select.
- `📝 Abrir el Test en VSCode para editar a mano` → solo en `mode != 'smoke'`.
- `🏠 Volver al menú principal`

## Reglas

- **No re-corras el Test más de 2 veces seguidas** sin reparación intermedia. Si tras 2 corridas sigue fallando con el mismo selector, pasá al fallback o al menú.
- **El comando para "Re-correr" depende del `mode`**:
  - `'smoke'` → `node .autoflow/scripts/run-test.js {specPath} --grep=\[testId:{testId}\]`
  - `'run-test'` → `node .autoflow/scripts/run-test.js {specPath} --headed --grep=\[testId:{testId}\]`
  - `'run-testset'` → mismo que `'run-test'` pero filtrando solo este testId; el caller decide si reabre el menú del set o no.
- **Nunca toques el spec ni el PO directamente desde este sub-prompt** — la edición la delegás a `auto-health-node.md` o `actualizar-nodos.md`, que ya manejan la atomicidad de PO + `nodos.json` + sidecar.
