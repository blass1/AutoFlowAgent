---
mode: agent
description: Sub-flow para reparar locators de nodos que cambiaron en el front. Se invoca desde correr-caso o correr-test-set después de un fallo.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Actualizar nodos sospechosos

Sub-flow que se carga cuando un test falla y el QA quiere reparar locators que probablemente cambiaron en el front. Recibís como contexto:

- `specPath` — el spec del test fallido (`tests/{slug}-{id}.spec.ts`).
- `numeroTC` — el número del caso (ej: `4521`).

## 1. Identificar las pages del caso

1. Leé `specPath`. Buscá las líneas `import X from '../pages/Y'`. Cada `Y` es un Page Object usado.
2. Para cada `Y`, leé `.autoflow/fingerprints/{Y}.json`. Si el sidecar no existe, ignorá esa page (es PO viejo previo a la convención de nodos).
3. Juntá todos los ids de `nodos[]` y `asserts[]` de cada sidecar.

## 2. Resolver los nodos contra `nodos.json`

Cargá `.autoflow/nodos.json`. Para cada id, leé el nodo completo (`accion`, `selector`, `selectorRaw`, `confiabilidad`, `etiqueta`, `page`).

**Filtrá** los que tienen `deprecated: true` — esos ya fueron reemplazados antes y no son candidatos de edición.

## 3. Mostrarle al QA la lista priorizada

Ordená los nodos por **confiabilidad ascendente** (los más frágiles primero, `null` al final). Mostralos con `vscode/askQuestions` multi-select: `"¿Qué nodos creés que cambiaron? (los más frágiles primero)"`. Cada opción con la forma:

```
[1/5] click "INGRESAR" — LoginPage
[1/5] click "Cuentas" — CuentasPage (iframe)
[2/5] fill "buscar" — CatalogoPage
[4/5] click "Confirmar" — TransferenciasPage
```

- Confiabilidad entre corchetes; `[N/A]` para `goto` y `assert`.
- `(iframe)` si el selector tiene segmento `iframe:` — son los más frágiles del banco.
- Si el QA no marca ninguno y confirma vacío, salí del sub-flow y volvé al menú anterior.

## 4. Para cada nodo seleccionado, pedir el nuevo locator

Por cada nodo elegido, en orden:

1. Mostrá el contexto:
   ```
   📍 {NombrePage} — {accion} {etiqueta}
      Locator actual:  {selectorRaw}
      Confiabilidad:   {n}/5
   ```

2. Abrí `vscode/askQuestions` single-select: `"¿Cómo querés armar el locator nuevo?"`:
   - `🪄 Capturar DOM y dejar que el agente proponga` → cargá `.autoflow/prompts/auto-health-node.md` con `{ nodoId }` del nodo elegido. Al volver, seguí con el siguiente nodo de la lista (saltate el resto del paso 4 para este nodo — `auto-health-node.md` ya hizo la edición atómica de PO + nodos.json + sidecar).
   - `✍️ Pegarlo a mano` → seguí al text input de abajo.

3. Si elige pegar a mano, abrí `vscode/askQuestions` con un text input:
   ```
   "Nuevo locator (formato Playwright literal — ej: getByRole('button', { name: 'OK' }))"
   ```

   Validá que la respuesta arranque con `getByTestId(`, `getByRole(`, `getByLabel(`, `getByPlaceholder(`, `getByText(`, o `locator(`. Si no, decilo corto y volvé a pedir. Acepta también chains con `.contentFrame()` o `.locator(...)` encadenados.

3. **Aplicá el cambio en 3 lugares atómicamente** (los 3, o ninguno):

   ### 3.a. Page Object (`pages/{NombrePage}.ts`)

   Leé el archivo. Buscá la línea que tenga el `selectorRaw` viejo del nodo (puede aparecer como argumento de `page.<chain>` en el constructor). Reemplazala por el nuevo locator. Si la línea no se encuentra textualmente, decilo y abortá este nodo (no toques `nodos.json` ni el sidecar).

   ### 3.b. `nodos.json`

   - El nodo viejo recibe dos campos nuevos: `"deprecated": true, "reemplazadoPor": "{nuevoId}"`. Mantené el resto de sus campos intactos — la traza histórica sigue apuntando acá.
   - Calculá el id del nuevo nodo: `{page}::{accion}::{nuevoSelectorNormalizado}`. Para normalizar el nuevo locator, aplicá las mismas reglas que `parse-codegen-output.js` (`normalizarSelector`): partir el chain por `.` top-level, colapsar `locator('frame[name="X"]').contentFrame()` → `iframe:X`, y unir con `>>`.
   - Calculá la nueva `confiabilidad` mirando la **hoja** del chain (5 testid, 4 role+name, 3 label, 2 placeholder/text, 1 locator).
   - Agregá el nuevo nodo a `nodos.json` con `{ id, page, accion, selector, selectorRaw, valor?, confiabilidad, matcher? }`.

   ### 3.c. Sidecar de la page (`.autoflow/fingerprints/{NombrePage}.json`)

   Reemplazá el id viejo por el nuevo en `nodos[]` o en `asserts[]` (donde estuviera). Mantené el orden.

4. Confirmale al QA con una línea corta: `✓ Actualizado {accion} "{etiqueta}" en {NombrePage} (nuevo: [{conf}/5]).`

## 5. Regenerar el grafo de nodos

Después de procesar todos los nodos seleccionados, ejecutá con `runCommands`:

```
node .autoflow/scripts/grafo-nodos.js
```

Callado salvo error.

## 6. Volver a correr

Abrí `vscode/askQuestions` single-select: `"Listo, actualicé {N} nodos. ¿Qué hacemos?"`:

- `🔄 Volver a correr el test` → ejecutá el comando de la opción "Volver a correr" del prompt invocador (correr-caso o correr-test-set).
- `🔧 Editar más nodos` → volvé al paso 3.
- `🏠 Volver al menú`

## Reglas

- **Nunca borres un nodo de `nodos.json`**. Solo marcalos `deprecated`. Las trazas (`{numero}-path.json`) siguen apuntando al id viejo y son históricas; no se reescriben.
- Si en el paso 3.a no encontrás la línea del locator viejo (porque el QA o un commit anterior ya la cambió a mano), abortá ese nodo y avisá: `⚠ No encontré "{selectorRaw}" en pages/{NombrePage}.ts — saltáme este nodo.`. Seguí con los demás.
- Si el nuevo id ya existe en `nodos.json` (porque otro flujo grabó el mismo selector), no lo dupliques: usá el existente.
