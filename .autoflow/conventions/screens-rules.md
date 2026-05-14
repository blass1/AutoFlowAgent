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

### Heurística A — Botón de confirmación

Por cada nodo `click` cuyo `selectorRaw` o `valor` matchee:

```
/log\s*in|login|ingresar|iniciar\s*sesión|aceptar|continuar|confirmar|preparar|guardar|enviar|finalizar|pagar|comprar|submit|aplicar|agregar|sumar|avanzar|siguiente|buscar|registrar|crear|aprobar|firmar/i
```

→ **2 candidatos**: uno antes del click, uno después.

### Heurística B — Pantalla principal post-navegación

Si un método del PO dispara navegación (lo detectás por `waitForLoadState('domcontentloaded')` al final del método, o por `sidecar.conecta[]` con un destino) **Y** la page destino matchea:

```
/home|overview|dashboard|main|inicio|principal|menú|landing/i
```

→ **1 candidato** al final del método (después del `waitForLoadState`).

### Anti-spam

- **No 2 screens consecutivos** sin acción del usuario en el medio. Si "antes del click X" choca con "después del click X-1" (clicks de confirmación seguidos), proponer **uno solo** — preferí "después del previo".
- **No en métodos solo-assert** (cuerpo único `expect(...).toBeVisible()` etc.). Esos asserts ya son evidencia funcional; un screen ahí es ruido.
- **Idempotencia**: si la línea `await screen(this.page, '{label}')` ya existe en ese punto del método, no la dupliques.

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
