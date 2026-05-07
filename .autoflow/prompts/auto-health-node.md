---
mode: agent
description: Mejora automáticamente el locator de un Nodo débil. Navega hasta el punto, captura el DOM, y razona sobre el HTML para proponer un locator más confiable.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Auto-Health Node

Sub-flow para reparar locators frágiles **antes** de que rompan en CI. El agente navega el flujo hasta el paso anterior al uso del **Nodo** débil, captura el DOM real (elemento + 7 ancestros), y propone un locator más confiable razonando sobre el HTML capturado.

Cuando arranca, podés tener pasados como contexto:
- `nodoId` — id del **Nodo** a mejorar (opcional; si vino del dashboard o de `actualizar-nodos.md`)

Si no recibís `nodoId`, vas al paso 0 (listado de nodos débiles).

## 0. Listar Nodos débiles para elegir uno

1. Cargá `.autoflow/nodos.json` y filtrá:
   - `confiabilidad` no `null` (descartar `goto`/`assert`/`capturar`/`verificar`)
   - `confiabilidad <= 3` (frágiles)
   - `deprecated !== true`
2. Para cada candidato, calculá las **referencias**: en qué Tests aparece (cruzá con `.autoflow/recordings/*-path.json`).
3. Ordená por confiabilidad ascendente, después por cantidad de Tests descendente (los más frágiles y más usados primero — máximo retorno por reparación).
4. Abrí `vscode/askQuestions` single-select: `"¿Qué **Nodo** querés sanear?"`. Cada opción mostrando:
   - Confiabilidad entre corchetes
   - `{accion} "{etiqueta}"` para identificar la acción
   - Page
   - Cantidad de Tests que lo usan

   ```
   [1/5] click "INGRESAR" — LoginPage (3 Tests)
   [1/5] click "Cuentas" — DashboardPage (5 Tests, iframe)
   [2/5] fill "buscar" — CatalogoPage (2 Tests)
   [3/5] click "Confirmar" — TransferenciasPage (1 Test)
   ❌ Cancelar
   ```

   Si el QA no marca ninguno y elige `❌ Cancelar`, salí al menú.

5. Anotá el `nodoId` elegido. Vas al paso 1.

## 1. Identificar dónde se usa el Nodo

1. Cargá `.autoflow/nodos.json` y resolvé el nodo: `nodo = nodos[nodoId]`. Anotá `page`, `accion`, `selectorRaw`, `confiabilidadActual`.
2. Cargá todas las trazas (`.autoflow/recordings/*-path.json`) y filtrá las que contengan `nodoId` en su `path[]`.
3. Para cada match, cargá la sesión correspondiente (`{numero}-session.json`) para tener el contexto del **Test** (nombre, canal, Test Set asociado).
4. Si hay **un solo Test** que usa el nodo: usalo como contexto para el warm-up.
5. Si hay **varios Tests**: `vscode/askQuestions` single-select preguntando cuál usar para llegar al estado. Cualquiera sirve técnicamente — sugerí el que tenga el path más corto al nodo (menos riesgo de fallar el warm-up por nodos del prefix rotos).
6. En el path elegido, identificá el **índice** del nodo objetivo. Eso te da `S` = la posición del paso en el Test.

## 2. Generar el spec de captura

En `tests/_temp/{nodoId-slug}-capture-{ts}.spec.ts` (carpeta excluida del runner via `testIgnore`):

```typescript
import { test } from '../../fixtures';
import { data{PascalSlug} } from '../../data';
// ... imports de los POs del Test fuente

test('capturar-dom-{nodoId}', async ({ page }) => {
  const { urlInicial, usuarioPrincipal /* ... */ } = data{PascalSlug};

  // Steps 1..S-1 copiados verbatim del test() fuente — todos los `await test.step(...)`
  // hasta el step inmediatamente anterior al uso del Nodo débil.
  // ...

  // Captura focused: el elemento + 7 ancestros + sus children directos.
  // Si el locator está roto y no encuentra el elemento, fallback a body.outerHTML.
  const target = page.{selectorRaw del Nodo};
  const fs = require('fs');
  const path = '.autoflow/captures/_locator-{ts}.html';
  let htmlCapturado = '';
  let modo = 'focused';
  try {
    await target.first().waitFor({ state: 'attached', timeout: 5000 });
    htmlCapturado = await target.first().evaluate((el) => {
      let n = el;
      for (let i = 0; i < 7 && n.parentElement; i++) n = n.parentElement;
      return n.outerHTML;
    });
  } catch {
    // Fallback: el locator está completamente roto, capturar body completo.
    htmlCapturado = await page.locator('body').innerHTML();
    modo = 'fallback-body';
  }
  fs.mkdirSync('.autoflow/captures', { recursive: true });
  fs.writeFileSync(path, htmlCapturado, 'utf8');
  console.log(`AUTOFLOW_CAPTURE: ${JSON.stringify({ ok: true, path, modo, length: htmlCapturado.length })}`);
});
```

Notas:
- Si la sesión del Test fuente tenía `authState`, agregá `test.use({ storageState: '...' })` arriba.
- El path del HTML usa el mismo timestamp `{ts}` que el spec para limpiarlos juntos.

## 3. Correr el spec de captura

Ejecutá con `runCommands`:
```
npx playwright test tests/_temp/{nodoId-slug}-capture-{ts}.spec.ts --workers=1 --reporter=line
```

Leé el output con `terminalLastCommand`. Buscá la línea `AUTOFLOW_CAPTURE: { ... }`.

**Si el warm-up falla antes de capturar** (locator de un paso anterior roto, timeout, etc.):
- Avisale al QA en 5–10 líneas con el error concreto.
- Single-select:
  - `🧩 Reparar Nodos del prefix primero` → cargá `.autoflow/prompts/actualizar-nodos.md` con `{ specPath, numeroTC: <numero del Test usado> }`. Al volver, repetí el paso 3.
  - `❌ Cancelar` → borrá el spec temporal y volvé al menú.

**Si captura OK** (`ok: true`):
- Si `modo === "fallback-body"`, avisale al QA: `⚠️ El locator actual no encuentra ningún elemento. Capturé el body completo, pero la propuesta puede ser menos precisa.`
- Seguí al paso 4.

## 4. Razonar sobre el HTML y proponer el locator nuevo

1. Leé el archivo capturado: `.autoflow/captures/_locator-{ts}.html`.
2. Razoná con tres entradas (mismo motor que `insertar-nodo-especial.md` paso 4.2.B):
   - El HTML capturado (foco en el elemento target o body si fue fallback).
   - El `selectorRaw` y `etiqueta` actuales del nodo (te dicen qué quería matchear).
   - Los locators existentes en el PO destino (`pages/{Page}.ts`) — para mantener coherencia de estilo.
3. Buscá el elemento target en el HTML capturado:
   - Heurística: si la `etiqueta` del nodo es texto visible, buscalo en el HTML.
   - O matcheá por la firma del `selector` normalizado (`getByRole:button:Ingresar` → buscar `<button>Ingresar</button>` o `role="button"` con texto `"Ingresar"`).
4. **Priorizá** el nuevo locator según la escala de confiabilidad:
   - **5** — `getByTestId('...')` si encontrás `data-testid` cerca del elemento.
   - **4** — `getByRole('...', { name: '...' })` si hay un rol semántico claro.
   - **3** — `getByLabel('...')` para inputs con label asociado.
   - **2** — `getByPlaceholder('...')` o `getByText('...')` (no debería ser una "mejora" si ya estamos ahí — solo si encontrás un texto más estable).
   - **1** — `locator(...)` solo como último recurso.

   **Solo proponer un locator si la confiabilidad nueva > confiabilidad actual.** Si lo mejor que encontrás es del mismo nivel, avisale al QA: `No encontré atributos más estables que el actual ({selectorRaw}). El locator ya está en el techo posible para este elemento.`

5. Mostrale al QA el "antes/después":

   ```
   🪄 Locator actual:    getByText('Continuar')                [2/5]
       Locator propuesto: getByTestId('btn-continuar')          [5/5]

   Por qué: el botón tiene `data-testid="btn-continuar"` directo en el elemento;
   getByTestId es inmune a cambios de copy y a re-orden del DOM.

   HTML del elemento (extracto):
       <button data-testid="btn-continuar" class="primary">Continuar</button>
   ```

6. `vscode/askQuestions` single-select: `"¿Aplico la mejora?"`:
   - `✅ Sí, aplicar`
   - `🔁 Probar otra alternativa` → text input pidiendo qué prefiere el QA (más estricto, menos estricto, otro selector específico). Volvé a 4 con esa pista.
   - `📝 Lo ajusto a mano` → text input para que el QA pegue su versión. Validá que arranque con `getBy*(` o `locator(` y avanzá a 5.
   - `❌ Cancelar` → no toques nada, limpiá temporales, volvé al menú.

## 5. Aplicar el cambio (atómico — los 3 lugares o ninguno)

Mismo patrón que `actualizar-nodos.md` paso 3:

1. **Page Object** (`pages/{Page}.ts`): localizá la línea con el `selectorRaw` viejo (asignación en el constructor) y reemplazala por el nuevo. Si la línea no se encuentra textualmente (porque alguien la editó a mano), avisá y abortá sin tocar nada más.
2. **`nodos.json`**:
   - Marcá el nodo viejo con `"deprecated": true, "reemplazadoPor": "{nuevoId}"`. **No** borres campos.
   - Calculá el id nuevo: `{page}::{accion}::{nuevoSelectorNormalizado}` (mismas reglas que `parse-codegen-output.js > normalizarSelector`).
   - Calculá la `confiabilidad` nueva mirando la hoja del chain.
   - Agregá el nodo nuevo al diccionario.
3. **Sidecar** (`.autoflow/fingerprints/{Page}.json`): reemplazá el id viejo por el nuevo en `nodos[]` (o `asserts[]` si era un assert) manteniendo el orden.

Confirmale al QA: `✓ Listo. {Page}::{accion} mejorado: [{confActual}/5] → [{confNueva}/5].`

## 6. Limpieza

Borrá:
- `tests/_temp/{nodoId-slug}-capture-{ts}.spec.ts`
- `.autoflow/captures/_locator-{ts}.html`

(El HTML es **efímero** — no vale la pena historial. Si el front cambia de nuevo, el QA vuelve a correr Auto-Health Node.)

Regenerá el grafo de nodos (callado salvo error):
```
node .autoflow/scripts/grafo-nodos.js
```

## 7. Cierre

Single-select: `"¿Qué hacemos?"`:
- `🪄 Sanear otro **Nodo** débil` → volvé al paso 0 (recargá la lista, el que acabás de mejorar ya no aparece).
- `▶️ Correr el Test que usa este nodo` → dispará la VSCode task con el filtro al `testId`.
- `🏠 Volver al menú`

## Reglas

- **Nunca borres un nodo** de `nodos.json`. Solo `deprecated`. Las trazas históricas siguen apuntando al id viejo.
- **No proponer si la confiabilidad no mejora**. Es una herramienta de upgrade, no de cambio lateral.
- Si en el paso 5.1 no encontrás la línea del locator viejo en el PO (porque fue editada a mano), abortá ese nodo con mensaje claro y dejá `nodos.json` y sidecar intactos.
- Si el nuevo id ya existe en `nodos.json` (otro flujo grabó el mismo selector), no lo dupliques — usá el existente.
