---
mode: agent
description: Crea un Test nuevo bifurcando desde un step de un Test existente. Reusa el prefix (mismos POMs y datos) y graba sólo la cola con el grabador.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Bifurcar Test desde un Nodo

Sub-flow para crear un **Test** nuevo que arranca desde un punto específico de un **Test** existente. Reusa el prefix (steps + Page Objects + datos compartidos) y solo graba la cola, sin que el QA tenga que rehacer login + navegación cada vez.

Cuando arranca, podés tener pasados como contexto:
- `numeroFuente` — testId del **Test** fuente
- `nodoId` — id del **Nodo** elegido (opcional; si vino del dashboard)

Si no recibís nada, pediselo al QA con `vscode/askQuestions` (single-select de **Test Set** → **Test** igual que `editar-caso.md` pasos 1-2).

## 1. Cargar contexto

Leé:
- `.autoflow/testsets/*.json` → identificá el **Test Set** que contiene `numeroFuente`. Anotá `slugFuente`, `setNombreFuente`, `setIdFuente`, `specPathFuente`.
- `.autoflow/recordings/{numeroFuente}-session.json` → `urlInicial`, `canal`, `authState`, `bufferTiempo` (heredado al **Test** bifurcado; si falta, asumí `false`).
- `.autoflow/recordings/{numeroFuente}-path.json` → traza del **Test** fuente.
- `.autoflow/nodos.json` → para resolver cada id a su definición.
- Sidecars de las pages que aparezcan en la traza.
- `tests/{slugFuente}-{setIdFuente}.spec.ts` → cuerpo del `test('{nombre} [testId:{numeroFuente}]', ...)`.
- `data/data-{slugFuente}.ts` → datos compartidos.

Validá:
- Si falta `path.json` o `session.json` → frená: "El Test fuente no tiene traza grabada — bifurcar requiere la traza completa. Regrabá el caso primero."
- Si falta el bloque `test()` con ese testId en el spec → frená: "No encuentro el bloque `test('... [testId:{numeroFuente}]', ...)` en {specPathFuente}."

## 2. Detectar punto de corte (step del Test fuente)

La unidad de corte es **el step** (`await test.step(...)`), no el nodo individual: bifurcar entre steps es mucho más confiable que partir un step por la mitad. Si el QA vino del dashboard apuntando a un Nodo específico, vas a buscar el step que **contiene** ese nodo y proponerlo como corte.

Pasos:

1. Parseá del cuerpo del `test()` fuente la lista ordenada de **steps**: cada uno es `await test.step('comentario', async () => { ... })` o `const X = await test.step('comentario', async () => { ... })`. Anotá `{ idx, comentario, codigo }` por cada uno.
2. Mapeá cada step al rango de nodos de la traza que cubre. Heurística:
   - El step "Abrir el canal" cubre el nodo `goto:{urlInicial}`.
   - Cada step posterior cubre los nodos que su método público de PO ejecuta. Para resolverlo, leé el sidecar de la page involucrada en ese step y contá los nodos. Si no podés mapear con certeza, listá igual los steps al QA y dejá que elija.
3. Si recibiste `nodoId`, buscá el step que lo contiene y marcalo como **sugerido**.
4. Abrí `vscode/askQuestions` single-select: `"¿Después de qué step querés bifurcar?"` con un radio por cada step:
   - `✅ Step 1: Abrir el canal` (formato `"Step {idx}: {comentario}"` — el ✅ marca el sugerido si vino de `nodoId`)
   - `Step 2: Loguearse y entrar al overview`
   - ...

Guardá el `idxCorte` (entero, 1-indexed). El prefix incluye los steps `1..idxCorte`.

## 3. Detectar limitaciones del prefix

Antes de avanzar, revisá los nodos de los steps `1..idxCorte`:

- **Capturar/verificar en el prefix**: si hay nodos `capturar` o `verificar`, mostrale al QA single-select:
  - `🔄 Replicar: el Test bifurcado va a ejecutar también esos nodos especiales (necesita los mismos datos)`
  - `⏭️ Omitir: solo el flujo navegacional, sin las captures` (más simple, recomendado salvo que el tail dependa de esas variables)
  - `❌ Cancelar`
- **Mid-form**: si el último step del prefix incluye un `fill`/`pressSequentially`/`selectOption`/`check` **sin** un click de submit posterior dentro del mismo step → estás cortando mid-form. Avisá explícitamente:
  ```
  ⚠ El step elegido termina con un input lleno pero sin submit. storageState
    captura cookies + localStorage + sessionStorage, pero NO el estado del
    formulario en memoria. El Test bifurcado va a llegar a la URL correcta
    pero sin esos campos llenos.

    ¿Cómo seguimos?
  ```
  - `🍴 Bifurcar igual (acepto la limitación)`
  - `↩️ Elegir otro step de corte`
  - `❌ Cancelar y crear un Test desde cero`

## 4. Datos del Test bifurcado

Carrousel con `vscode/askQuestions`:
1. `"¿Cómo se llama el **Test** bifurcado?"` → text input (ej: `Compra de dolar mep con CC`)
2. `"testId del nuevo **Test**"` → text input (ej: `43214`). Validá que no exista ya en ningún `path.json`.

Después, single-select: `"¿En qué **Test Set** va?"`:
- `📌 El mismo: "{setNombreFuente}" [testSetId:{setIdFuente}]` (recomendado)
- Cada **Test Set** existente como opción aparte
- `➕ Crear nuevo **Test Set**`

Si elige crear nuevo, mismo carrousel que `crear-test-set.md` paso 1 (nombre, id, descripción).

Anotá `slugDestino`, `setIdDestino`, `setNombreDestino`, `specPathDestino = tests/{slugDestino}-{setIdDestino}.spec.ts`.

## 5. Generar el spec de warm-up

En `tests/_temp/{nuevoTestId}-fork-{ts}.spec.ts` (la carpeta `_temp/` está excluida del runner via `testIgnore`):

```typescript
import { test } from '../../fixtures';
import { data{PascalSlugFuente} } from '../../data';
// ... imports de los POs que use el prefix (los mismos que el Test fuente)

test('warmup-fork-{nuevoTestId}', async ({ page, context }) => {
  const { urlInicial, usuarioPrincipal /*, ...campos del prefix */ } = data{PascalSlugFuente};

  // Instancias de Page Objects del prefix — copiá las mismas que el Test fuente
  // (mismo bloque, una por línea, prolijas).
  const loginPage = new LoginPage(page);
  const overviewPage = new OverviewPage(page);
  // ... etc, según el prefix

  // Steps 1..idxCorte copiados verbatim del test() fuente.
  // Si la decisión de capturar/verificar fue "omitir", saltá esos test.step.

  // Al final del prefix:
  console.log('FORK_URL:', page.url());
  await context.storageState({ path: '.autoflow/auth/_fork-{ts}.json' });
});
```

Notas:
- Si la sesión fuente tenía `authState`, agregá `test.use({ storageState: '{authState}' })` arriba del bloque `test()` (igual que en el Test original).
- El path del storageState efímero usa `_fork-` como prefijo y el mismo timestamp `{ts}` que el spec.

**Generá también el config temporal** `tests/_temp/{nuevoTestId}-fork-{ts}.config.ts`. Sin esto el spec no corre — el `testIgnore: ['**/_temp/**']` global lo filtra aunque le pases el path explícito:

```typescript
import baseConfig from '../../playwright.config';
export default { ...baseConfig, testIgnore: [] };
```

## 6. Correr el warm-up

Ejecutá con `runCommands` — **siempre con `--config` apuntando al temporal**:
```
npx playwright test tests/_temp/{nuevoTestId}-fork-{ts}.spec.ts --config tests/_temp/{nuevoTestId}-fork-{ts}.config.ts --headed --workers=1 --reporter=line
```

Después de que termine, leé el output con `terminalLastCommand` y clasificá el resultado en **uno de estos cuatro casos**:

| Caso | Cómo lo detectás | Causa raíz típica |
|---|---|---|
| **A · OK** | El output tiene la línea `FORK_URL: <url>`. | Todo bien — seguí al paso 7. |
| **B · 0 tests run** | `0 passed` / `No tests found` y no aparece ni `FORK_URL:` ni traceback de Playwright. | El config temporal falló (faltó `--config` o no se generó). Es bug de orquestación, no del Test. |
| **C · Warm-up falló** | Aparece traceback de Playwright **antes** de `FORK_URL:`. | Un locator del prefix está roto. |

Reacción según el caso:

- **A** → seguí al paso 7.
- **B** → mostrale al QA el comando ejecutado, regenerá el config temporal y reintentá. Si dos reintentos seguidos caen en B, salí con error claro — hay un problema más fundamental que no se resuelve con otra corrida.
- **C** → ramá de reparación del prefix con loop guard:
  1. Mostrale al QA el error en 5-10 líneas (línea `Error:` + 3-4 circundantes).
  2. Si llevás **≥2 vueltas** de "Reparar prefix → re-correr → vuelve a fallar" en esta sesión de `bifurcar-caso`, no re-ofrezcas reparación: avisá que el Test fuente tiene drift profundo (`Después de 2 intentos de reparación, el prefix sigue fallando. Probablemente el Test fuente necesita regrabarse o el front cambió más allá de un par de nodos.`) y volvé al menú tras borrar temporales.
  3. Si es la 1ra o 2da vuelta, single-select con la reparación **como opción recomendada**:
     - `🧩 Reparar Nodos del prefix (Recomendado)` → cargá `.autoflow/prompts/actualizar-nodos.md` con `{ specPath: 'tests/_temp/{nuevoTestId}-fork-{ts}.spec.ts', numeroTC: nuevoTestId }`. Al volver, incrementá tu contador interno de vueltas y repetí el paso 6.
     - `❌ Cancelar` → borrá el spec temporal, el config temporal y el storageState (si se llegó a crear) y volvé al menú.

## 7. Lanzar el grabador con storage cargado

```
npx playwright codegen --load-storage=.autoflow/auth/_fork-{ts}.json --output=tests/_temp/{nuevoTestId}-tail-{ts}.spec.ts {forkUrl}
```

Avisá al QA antes de lanzar:
```
🍴 Voy a abrir Chrome en el punto donde elegiste bifurcar.
   Navegá la cola del flujo nuevo y, cuando termines, cerrá el browser.
```

`runCommands` bloquea hasta que cierre Chromium.

## 7.5. Confirmar que terminó de grabar — antes de procesar

Cuando `runCommands` retorna, **NO procedas directamente**. Puede retornar antes de que el QA termine la grabación de la cola. Confirmá explícitamente:

`vscode/askQuestions` single-select: `"¿Ya terminaste de grabar la cola y cerraste el browser?"`:
- `✅ Sí, procesá la cola`
- `🔁 No, todavía estoy grabando — esperame`

Si responde `🔁 No`: mostrá un mensaje corto pidiendo que termine y cierre el browser, y volvé a abrir el mismo single-select. Repetí hasta que confirme `✅ Sí`. **No avancés mientras la respuesta sea "No"**.

Cuando confirme `✅ Sí`, verificá que `tests/_temp/{nuevoTestId}-tail-{ts}.spec.ts` existe y no está vacío. Si no, ofrecele relanzar el grabador (volver al paso 7) o cancelar (limpiar warm-up + storageState y volver al menú).

## 8. Procesar el tail

Cuando vuelve el control y el QA confirmó que terminó, el grabador escribió `tests/_temp/{nuevoTestId}-tail-{ts}.spec.ts` con el código crudo de la cola.

1. **Crear sesión** `.autoflow/recordings/{nuevoTestId}-session.json`:
   ```json
   {
     "activa": false,
     "fechaInicio": "<iso>",
     "fechaFin": "<iso>",
     "nombre": "<nombre>",
     "numero": "<nuevoTestId>",
     "canal": "<canal del fuente>",
     "urlInicial": "<urlInicial del fuente>",
     "qa": <user.json>,
     "specPath": "{specPathDestino}",
     "bufferTiempo": <heredado del Test fuente>,
     "modo": "fork",
     "forkContext": {
       "desdeTestId": "<numeroFuente>",
       "desdeSetSlug": "<slugFuente>",
       "stepCorte": <idxCorte>,
       "stepComentario": "<comentario del step de corte>"
     }
   }
   ```
2. **Parsear la cola**: copiá `tests/_temp/{nuevoTestId}-tail-{ts}.spec.ts` a `.autoflow/recordings/{nuevoTestId}.spec.ts` y ejecutá:
   ```
   node .autoflow/scripts/parse-codegen-output.js {nuevoTestId}
   ```
   Tenés `parsed.json` con los nodos crudos del tail.
3. **Cargá `generar-pom.md`** pasándole un contexto especial: `{ modo: 'fork', numero: nuevoTestId, prefix: { steps, nodosIds }, dataDestino, slugDestino }`. En `generar-pom.md`, antes del paso 4, sumá la siguiente lógica de modo fork (instrucción interna, no es un cambio al prompt):
   - El matcheo por vocabulario del paso 3 corre normal sobre los nodos del **tail**.
   - Saltás los pasos 7 y 8.a normales y vas al **paso 8.b adaptado para fork** (ver paso 9 acá).

> Implementación pragmática: en lugar de tocar `generar-pom.md`, hacé los pasos 3-6 de matcheo/agrupación inline acá replicando la lógica (matchear contra fingerprints, agrupar nodos nuevos en POs, persistir nodos.json + sidecars, regenerar grafos). Si en el futuro se vuelve repetitivo, extraemos en un helper.

## 9. Materializar el Test bifurcado

### 9.a. Datos en `data/data-{slugDestino}.ts`

- **Si `slugDestino === slugFuente`**: el data file ya tiene `urlInicial`, `usuarioPrincipal` y los datos del prefix. Sumá los datos nuevos del tail (con sus tipos en la `interface Data{PascalSlugDestino}`).
- **Si es Test Set distinto**: creá `data/data-{slugDestino}.ts` autocontenido siguiendo `pom-rules.md` → "Datos de prueba". Heredá `urlInicial`, `usuarioPrincipal` y los campos del prefix desde el data fuente (copialos verbatim — son datos compartidos por construcción del fork). Sumá los datos del tail.
- Re-exportá desde `data/index.ts` si el Test Set es nuevo.

### 9.b. Spec destino — `{specPathDestino}`

- **Si el archivo no existe** (Test Set nuevo): creá el archivo con los imports y el `test.describe('{setNombreDestino} [testSetId:{setIdDestino}]', () => { ... })` vacío.
- Insertá el nuevo `test('{nombreNuevo} [testId:{nuevoTestId}]', ...)` **dentro** del `test.describe`, al final.
- Cuerpo del nuevo `test()` siguiendo la convención de `pom-rules.md` (sin chains; instancias arriba):
  - **Imports unificados**: POs del prefix + POs del tail (sumar al tope del archivo, sin duplicar).
  - **Destructuring de data**: `const { urlInicial, usuarioPrincipal, /* campos del prefix + tail */ } = data{PascalSlugDestino};`.
  - **Bloque de instancias** de Page Objects (todas, prefix + tail, una por línea, prolijas) — directamente después del destructuring de data, antes de cualquier `test.step`.
  - **Steps 1..idxCorte (prefix)**: copiá los `test.step(...)` del Test fuente verbatim. Como el Test fuente sigue la misma convención (instancias arriba, métodos void), no hay que reescribir nada — los `await {paginaCamelCase}.{metodo}()` quedan iguales y referencian las variables del bloque de instancias.
  - **Steps del tail**: agrupados como en `generar-pom.md` paso 8.b, en `test.step` con comentarios cortos. Las pages nuevas que aparezcan en el tail se suman al bloque de instancias arriba.

Ejemplo del cuerpo resultante:

```typescript
test('Compra de dolar mep con CC [testId:43214]', async ({ page }) => {
  const { urlInicial, usuarioPrincipal, importeOperacion, cuentaDestino } = dataDolarMep;

  // Instancias de Page Objects — todas arriba, prolijas.
  const loginPage = new LoginPage(page);
  const overviewPage = new OverviewPage(page);
  const accesoFimaPage = new AccesoFimaPage(page);
  const confirmarCCPage = new ConfirmarCCPage(page);

  // ── Prefix (heredado del Test [testId:43213], steps 1..3) ──
  await test.step('Abrir el canal', async () => {
    await page.goto(urlInicial);
  });
  await test.step('Loguearse y entrar al overview', async () => {
    await loginPage.ingresar(usuarioPrincipal.user, usuarioPrincipal.pass);
  });
  await test.step('Abrir Inversiones → Fondos Fima', async () => {
    await overviewPage.abrirInversiones();
  });

  // ── Tail bifurcado ──
  await test.step('Suscribir desde cuenta corriente', async () => {
    await accesoFimaPage.suscribirCC(importeOperacion, cuentaDestino);
  });
});
```

Comentarios `── Prefix ──` / `── Tail bifurcado ──` opcionales pero recomendados — facilitan al QA ver dónde fue el corte.

### 9.c. Test Set JSON destino

- Si es nuevo: creá `.autoflow/testsets/{slugDestino}.json` siguiendo `crear-test-set.md` paso 3 — `specPath` a nivel raíz (no dentro de cada caso), con el nuevo caso en `casos[]` como `{ numero, nombre }`.
- Si es existente: enriquecé `casos[]` agregando `{ numero: '<nuevoTestId>', nombre: '<nombreNuevo>' }`. **No** repitas `specPath` por caso — ya está a nivel raíz del set.

## 10. Traza del Test bifurcado

`{nuevoTestId}-path.json` se construye **manualmente** acá (no podemos correr `generar-traza.js` porque la traza tiene dos partes con orígenes distintos):

```json
{
  "numero": "<nuevoTestId>",
  "fechaFin": "<iso>",
  "origen": "fork",
  "desdeTestId": "<numeroFuente>",
  "stepCorte": <idxCorte>,
  "path": [
    "<ids 1..N del path fuente>",
    "<ids del tail recién agrupado>"
  ]
}
```

Los ids del prefix son los mismos del fuente (los nodos colapsan por id determinístico — no se duplican en `nodos.json`).

## 11. Limpieza

Borrá:
- `tests/_temp/{nuevoTestId}-fork-{ts}.spec.ts`
- `tests/_temp/{nuevoTestId}-fork-{ts}.config.ts`
- `tests/_temp/{nuevoTestId}-tail-{ts}.spec.ts`
- `.autoflow/auth/_fork-{ts}.json`
- `.autoflow/recordings/{nuevoTestId}.spec.ts`
- `.autoflow/recordings/{nuevoTestId}-parsed.json`
- `.autoflow/recordings/{nuevoTestId}-grupos.json` (si se creó)

Mantené `{nuevoTestId}-session.json` y `{nuevoTestId}-path.json`.

Regenerá los grafos:
```
node .autoflow/scripts/grafo.js
node .autoflow/scripts/grafo-nodos.js
```

## 12. Resumen y cierre

```
🍴 Listo. Bifurqué el **Test** [testId:{numeroFuente}] desde el step "{comentarioCorte}".

  • Test nuevo:   "{nombreNuevo}" [testId:{nuevoTestId}]
  • Test Set:     "{setNombreDestino}" [testSetId:{setIdDestino}] {(nuevo|existente)}
  • Spec:         {specPathDestino}
  • Page Objects nuevos: {lista o "ninguno"}
```

`vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `▶️ Correrlo ahora` → dispará la VSCode task `autoflow:run-test-headed` con `--grep=\[testId:{nuevoTestId}\]` (forma `=` sin quotes — evita problemas de escapado en PowerShell).
- `🍴 Bifurcar otro Test`
- `🏠 Volver al menú`

## Limitaciones documentadas

- **storageState ≠ in-memory state**: cookies + localStorage + sessionStorage se preservan, pero no el estado de formularios a medio llenar, modales abiertos, ni JS state. Ya se le avisa al QA en el paso 3 si detectamos mid-form.
- **El warm-up corre el código del prefix tal cual está**: si los locators del prefix se rompieron en el front, hay que repararlos antes (paso 6).
- **`capturar`/`verificar` en el prefix**: el QA decide replicarlos o no (paso 3). Si los replica, la cola va a tener acceso a `vars.get(...)` igual que en el Test fuente.
- **Cortes mid-step no soportados**: la unidad mínima es el `test.step`. Si el QA quiere cortar entre dos `await` dentro del mismo step, primero hay que partir ese step en dos en el Test fuente.
