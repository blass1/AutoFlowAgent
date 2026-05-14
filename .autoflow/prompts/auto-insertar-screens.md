---
mode: agent
description: Sub-flow que analiza POMs + spec, propone screenshots automáticos en puntos clave (botones de confirmación, pantallas principales), confirma con el QA y aplica los cambios al PO + sidecar + nodos.json + traza. Tiene dos entry points: post-smoke desde generar-pom.md y on-demand desde editar-caso.md → 📸 Screenshots.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Auto-insertar screenshots

Sub-flow opt-in con **dos entry points**:

- **Create flow** (`generar-pom.md` paso 11, tras smoke test exitoso): se invoca con `invokedFrom: 'create'`. El create se mantiene liviano (solo modelado del flujo) y los screens se ofrecen sobre un Test que ya sabemos que anda.
- **Edit flow** (`editar-caso.md → 📸 Screenshots → 🤖 Generar automáticamente`): se invoca con `invokedFrom: 'edit'`. El QA puede pedir auto-generación en cualquier momento posterior a la creación del Test.

## Inputs

- `specPath`: ruta del spec (ej: `tests/dolarMep-12345.spec.ts`).
- `slug`: slug del test set.
- `numero`: testId del caso.
- `invokedFrom`: `'create' | 'edit'` — define el cierre (paso 5). Si no viene, asumí `'create'` (entry point histórico).

## 1. Cargar estado

1. Leé el spec y parseá los `await {pom}.{metodo}(...)` para reconstruir la cadena de llamadas.
2. Leé `.autoflow/recordings/{numero}-path.json` para tener la traza ordenada de nodos.
3. Leé `.autoflow/nodos.json` para resolver cada id de la traza.
4. Para cada Page Object referenciado por el spec (`pages/*.ts`), leé el archivo.

## 2. Identificar puntos candidatos

Aplicá las heurísticas en este orden, según [`.autoflow/conventions/screens-rules.md`](../conventions/screens-rules.md) (regex, anti-spam y reglas completas viven ahí, no duplicar acá):

1. **Heurística A** — *antes* de cada click de confirmación (login/aceptar/continuar/etc.).
2. **Heurística B** — al final de los métodos que navegan a una pantalla principal (home/dashboard/etc.) y terminan con `waitForLoadState`.
3. **Heurística C** *(cobertura mínima)* — para cada Page Object usado en el spec que **no haya quedado cubierto por A ni B** (ni tenga un `capturar-screen` existente de corridas previas), proponé un screen al inicio del primer método de esa page invocado en el spec. Garantiza ≥1 screen por Page.

La C es la última pasada y opera sobre el conjunto residual de pages sin screen. **No duplica**: si una page ya quedó cubierta por A, B o un screen manual, no se propone candidato adicional por C.

**Si tras A+B+C no hay ningún candidato nuevo** (caso muy raro — implica que todas las pages ya tienen screens o son solo-asserts sin método propio), decilo honesto: `"Todas las pages del Test ya tienen al menos un screen. Si querés sumar uno puntual, usá ➕ Agregar un screenshot a un paso del menú de Screenshots."` y volvé al menú sin tocar archivos.

## 3. Mostrar la propuesta al QA — con preview

Mostrá una lista numerada de TODOS los puntos candidatos detectados, agrupados por método del PO. Anotá entre paréntesis qué heurística disparó cada candidato — al QA le da contexto y le facilita decidir cuáles aceptar:

- **A** (Heurística A) = antes de click de confirmación.
- **B** (Heurística B) = fin de método con navegación a pantalla principal.
- **C** (Heurística C) = cobertura mínima de Page (porque la page no estaba cubierta por A ni B).

```
📸 Encontré N puntos candidatos para screenshots automáticos:

  pages/LoginPage.ts → ingresar(usuario, password)
    [1] ANTES del click "Log in"             → label "LoginPage-pre-login"          (A)

  pages/HomePage.ts → elegirProducto(producto)
    [2] FIN del método (pantalla principal)  → label "HomePage-cargada"             (B)

  pages/CatalogoPage.ts → buscarProducto(query)
    [3] INICIO del método (cobertura Page)   → label "CatalogoPage-vista"           (C)

  pages/CheckoutPage.ts → confirmar(datos)
    [4] ANTES del click "Purchase"           → label "CheckoutPage-pre-purchase"    (A)

Total: N screens (incluye {nC} de cobertura mínima — garantiza ≥1 screen por Page). ¿Cómo seguimos?
```

`vscode/askQuestions` single-select:

- `✅ Aplicar todos` → seguí al paso 4.
- `✂️ Elegir cuáles aplicar` → abrí un `multi-select` con cada candidato como opción (label corto + ubicación). Aplicá solo los tildados.
- `❌ Cancelar` → volvé al caller (ramificado en el paso 5 según `invokedFrom`) sin tocar nada.

## 4. Aplicar los cambios

Por cada candidato aprobado, aplicá las **4 mutaciones atómicas** documentadas en [`.autoflow/conventions/screens-rules.md`](../conventions/screens-rules.md) → sección **Reglas de mutación atómica** (caso "agregar"):

1. **Page Object**: agregar import de `screen` si falta + insertar `await screen(this.page, '{label}')` en la posición resuelta por la heurística (antes del click de confirmación, o al final del método tras `waitForLoadState`).
2. **`nodos.json`**: agregar el nodo si el id no existe (shape en `screens-rules.md`).
3. **Sidecar** (`.autoflow/fingerprints/{NombrePage}.json`): sumar el id al final de `nodos[]`. Sin duplicar.
4. **Traza** (`.autoflow/recordings/{numero}-path.json`): insertar el id en `path[]` en la posición correspondiente.

## 5. Cierre — ramificado según `invokedFrom`

Mostrale al QA un resumen común (mismo formato para los dos entry points):

```
✅ Aplicados K screens en M método(s):
  • pages/LoginPage.ts → ingresar()         +1 screen   (A — antes del click "Log in")
  • pages/HomePage.ts → elegirProducto()    +1 screen   (B — fin del método, pantalla cargada)
  • pages/CatalogoPage.ts → buscarProducto()+1 screen   (C — cobertura mínima de Page)
  • pages/CheckoutPage.ts → confirmar()     +1 screen   (A — antes del click "Purchase")

  Total nodos `capturar-screen` agregados: K
  Cobertura: 4/4 pages del Test tienen ≥1 screen ✓
  Archivos tocados: pages/*.ts, fingerprints/*.json, recordings/{numero}-path.json, nodos.json
```

Después, ramificá el retorno según `invokedFrom`:

- **`invokedFrom: 'create'`** (post-smoke desde `generar-pom.md`): volvé a `generar-pom.md` paso 11 — la pregunta post-smoke se reabre y el QA puede correr el Test ahora con screens incluidos para validar.
- **`invokedFrom: 'edit'`** (on-demand desde `editar-caso.md`): abrí `vscode/askQuestions` single-select: `"¿Algo más?"` con:
  - `📸 Volver al menú de Screenshots` → reabrí el sub-menú de `editar-caso.md → 📸 Screenshots` (auto / agregar / quitar).
  - `▶️ Correr el Test ahora` → disparalo con la VSCode task de correr-caso filtrado al `numero`.
  - `🏠 Volver al menú principal`.

> Si `invokedFrom` no vino seteado (caller legacy), asumí `'create'` para no romper el comportamiento histórico.

## Notas

- **No se vuelve a correr el smoke** automáticamente — la inserción es solo en código, los screens recién se materializan en la próxima corrida.
- **Las heurísticas son best-effort**. Si el QA quiere screens en puntos que la heurística no detectó, los agrega después vía `editar-caso.md → 📸 Screenshots → ➕ Agregar un screenshot a un paso`.
- **Idempotencia**: si el QA dispara este sub-flow dos veces sobre el mismo Test, los candidatos que ya tienen su `screen()` en el código se detectan (la línea ya está) y se omiten del propose, no se duplican.
