# Convenciones de screenshots de evidencia (`capturar-screen`)

Source of truth de cómo se modela un screenshot en este repo: helper, formato, heurísticas de auto-inserción, anti-spam, idempotencia y entry points. Los prompts (`auto-insertar-screens.md`, `insertar-screen.md`, `quitar-screen.md`) referencian este archivo en lugar de duplicar reglas.

---

## Helper `screen(page, label)`

Materializado en [fixtures/index.ts](../../fixtures/index.ts) → función `screen(page: Page, label: string)`:

```ts
import { screen } from '../fixtures';
// ...
await screen(this.page, 'HomePage-post-login');
```

Comportamiento:
- Espera `domcontentloaded` antes de disparar.
- Si detecta `[aria-busy=true]:visible`, espera hasta **3s** a que desaparezca. Evita screens de pantallas a medio cargar.
- Lee `process.env.AUTOFLOW_RUN_DIR` (lo setean los wrappers `run-test.js` / `run-testset.js` o el reporter `lib/run-reporter.js` en `onBegin`).
- Si `AUTOFLOW_RUN_DIR` no está seteado, retorna `null` silencioso — el test no se rompe.
- Captura **JPEG quality 60, viewport only** (no full-page) en `{AUTOFLOW_RUN_DIR}/screens/{testId}/{label}_DD_MM_YYYY_HH_MM_SS.jpg`.

El PDF de evidencia (`run-report.js`) levanta los `.jpg` de esa carpeta como captions del Test.

---

## Shape del nodo `capturar-screen`

Va a `sidecar.nodos[]` (no a `asserts[]`):

```json
{
  "id": "HomePage::capturar-screen::welcome-loaded",
  "page": "HomePage",
  "accion": "capturar-screen",
  "label": "HomePage",
  "selector": "page",
  "selectorRaw": "screen(page, 'HomePage')",
  "confiabilidad": null
}
```

Campos:
- **id**: `{page}::capturar-screen::{slug-del-label}` — determinístico. Permite reusar el mismo screen-spot entre Tests que pasan por la misma page.
- **label**: el string que va al filename y al PDF como caption (preserva mayúsculas/espacios del input del QA).
- **selector / selectorRaw**: convención de "no-locator" — el target es `page` y el raw es la llamada literal al helper.
- **confiabilidad**: siempre `null` (no hay locator a evaluar).

> El parser de codegen (`parse-codegen-output.js`) **no** emite estos nodos. Solo los crea el agente vía los prompts de abajo. El dashboard los muestra en la traza con ícono 📸.

### Slug del label

`label` → `slug` para construir el id: lowercase, espacios → `-`, no-alfanumérico → eliminado, colapsar `--` repetidos.

Ejemplos:
- `"HomePage tras login"` → `homepage-tras-login`
- `"CheckoutPage - pre-purchase"` → `checkoutpage-pre-purchase`
- `"Página principal"` → `pagina-principal`

El label original se preserva intacto en el filename y el `label` del nodo (para que el caption del PDF mantenga el casing del QA).

---

## Heurísticas de auto-inserción (single source)

Las usa **solo** `auto-insertar-screens.md` (sub-flow opt-in post-smoke). `generar-pom.md` **no** inserta screens durante la generación — eso es por diseño (el create se mantiene liviano).

### Heurística A — Antes de un botón de confirmación

Por cada nodo `click` cuyo `selectorRaw` o `valor` matchee:

```
/log\s*in|login|ingresar|iniciar\s*sesión|aceptar|continuar|confirmar|preparar|guardar|enviar|finalizar|pagar|comprar|submit|aplicar|agregar|sumar|avanzar|siguiente|buscar|registrar|crear|aprobar|firmar/i
```

→ **1 candidato: ANTES del click**.

> **Por qué solo "antes" y no "después"**: el screen tomado inmediatamente después de un click captura la pantalla de **transición** (loader, modal a medio cerrar, navegación en curso) y no la pantalla destino real. La pantalla destino se cubre por la **Heurística B** (cuando se llega a una page principal con `waitForLoadState` completo) o por el "antes" del siguiente click de confirmación. El valor probatorio del screenshot es el **estado del formulario completo / decisión del usuario antes de confirmar**, no la transición.

### Heurística B — Pantalla principal post-navegación

Si un método del PO dispara navegación (lo detectás por `waitForLoadState('domcontentloaded')` al final del método, o por `sidecar.conecta[]` con un destino) **Y** la page destino matchea:

```
/home|overview|dashboard|main|inicio|principal|menú|landing/i
```

→ **1 candidato** al final del método (después del `waitForLoadState`). Esta es la única forma legítima de capturar "una pantalla post-acción": esperando explícitamente que termine de cargar.

### Heurística C — Cobertura mínima: 1 screen por Page

> **Garantía**: cada Page Object usado en el spec termina con **al menos 1** nodo `capturar-screen` asociado. La C se aplica como tercera pasada, **solo a las pages que las heurísticas A y B no cubrieron**.

Algoritmo:

1. Después de aplicar A y B, calculá `pagesCubiertas` = unión de:
   - Las pages que aparecen como destino de algún screen propuesto en A o B en esta corrida.
   - Las pages que ya tienen un `capturar-screen` existente en el código (idempotencia con corridas anteriores y con screens insertados a mano).
2. `pagesUsadas` = pages de cada `import` de `../pages/` en el spec, filtrando las que efectivamente tienen al menos un método invocado (no solo importado y nunca usado).
3. `pagesSinCobertura` = `pagesUsadas` − `pagesCubiertas`.
4. Para cada page en `pagesSinCobertura`:
   - Encontrá el **primer método** de esa page llamado en el spec (orden de aparición en el `test()`).
   - Proponé un screen al **inicio del cuerpo** de ese método (antes de cualquier acción), siguiendo la misma convención de "antes de la acción" que la Heurística A.
   - **Label sugerido**: `{NombrePage}-vista` (kebab-friendly, no choca con `pre-{X}` ni con `cargada`).

Casos borde:
- **Page importada pero ningún método invocado**: skipear. No hay punto natural donde insertar.
- **El primer método llamado es solo-assert** (cuerpo único `expect(...)`): la regla de anti-spam "no en métodos solo-assert" **NO aplica** para C — el screen se inserta igual al inicio del método, porque la garantía de cobertura tiene prioridad. Si la page no tiene ningún método no-assert, capturar el estado en el método solo-assert sigue siendo útil como evidencia visual del prelude del assert.
- **El primer método ya tiene un screen al inicio** (por idempotencia con corridas previas o un screen manual): la page ya está cubierta, no se propone nada nuevo.

### Anti-spam

- **No en métodos solo-assert** (cuerpo único `expect(...).toBeVisible()` etc.) — aplica a A y B, **no** a C (que prioriza cobertura mínima).
- **Idempotencia**: si la línea `await screen(this.page, '{label}')` ya existe en ese punto del método, no la dupliques. Aplica a las tres heurísticas.
- **Cap por método**: si un método tiene 3+ clicks de confirmación seguidos, generá screens solo en el primero y el último; los del medio son ruido. Aplica solo a A.

---

## Entry points (qué prompt hace qué)

| Cuándo | Prompt | Resultado |
|---|---|---|
| Post-smoke exitoso, opt-in | [auto-insertar-screens.md](../prompts/auto-insertar-screens.md) | Aplica heurísticas A+B, muestra propuesta enumerada al QA con preview, aplica solo los aprobados. |
| QA quiere uno puntual | [insertar-screen.md](../prompts/insertar-screen.md) | Lista pasos del Test, QA elige paso + label, se inserta `screen()` después de ese paso en el método del PO correspondiente. |
| QA quiere quitar uno existente | [quitar-screen.md](../prompts/quitar-screen.md) | Lista los `capturar-screen` del Test, QA elige cuál sacar, se borra la línea del PO + entrada en path.json. Sidecar y `nodos.json` quedan intactos (otros Tests pueden seguir usando el mismo id). |

Los tres son invocables desde `editar-caso.md → 📸 Screenshots`. `auto-insertar-screens.md` también se invoca desde `generar-pom.md` paso 11 tras smoke exitoso.

---

## Reglas de mutación atómica

Cuando se **agrega** un screen (auto o manual), los 4 cambios van juntos (o ninguno):

1. **Page Object** (`pages/{NombrePage}.ts`): agregar `import { screen } from '../fixtures'` si no estaba (reusar el import de `../fixtures` si ya hay otras cosas — ej. `bufferEntreAcciones`). Insertar la línea `await screen(this.page, '{label}');` en la posición resuelta por el flujo.
2. **`nodos.json`**: agregar el nodo con el shape de arriba si el id no existe (no duplicar — el mismo id se reusa entre Tests).
3. **Sidecar** (`.autoflow/fingerprints/{NombrePage}.json`): sumar el id al final de `nodos[]` (no `asserts[]`). No duplicar.
4. **Traza** (`.autoflow/recordings/{numero}-path.json`): insertar el id en `path[]` en la posición correspondiente al punto donde va el `screen()`.

Cuando se **quita** un screen (vía `quitar-screen.md`):

1. **Page Object**: borrar la línea `await screen(this.page, '{label}');` del método. Si era el único `screen` del archivo y el import `screen` no lo usa nadie más, también borrar el import (o limpiarlo del `import { ..., screen }` compuesto).
2. **Traza** (`{numero}-path.json`): borrar la entrada de ese id en `path[]`.
3. **`nodos.json` y sidecar**: **no tocar** — el id puede estar siendo usado por otros Tests/métodos. Borrar acá generaría un dangling reference en otra traza. Quedan como "documentados pero potencialmente ya no usados desde este Test específico".

---

## Coherencia con otros sub-flows

- **`generar-pom.md` paso 11.5** (post-smoke ramificación "Si el smoke pasa") ofrece `📸 Agregar screenshots automáticos` que delega en `auto-insertar-screens.md`.
- **`editar-caso.md` paso 3** ofrece `📸 Screenshots` con tres ramas (auto / agregar uno / quitar uno) — ver tabla de entry points.
- **`bifurcar-caso.md`**: cuando se bifurca un Test, los `capturar-screen` del prefix se conservan tal cual en la traza del nuevo Test (ids determinísticos colapsan). Si el QA quiere agregar/quitar en el bifurcado, usa los mismos entry points sobre el Test nuevo.
- **`validar-coherencia.js`** no audita screens (no tienen confiabilidad ni replazoPor). Solo chequea que el id del nodo `capturar-screen` referenciado en `sidecar.nodos[]` exista en `nodos.json`.
