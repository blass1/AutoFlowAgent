---
mode: agent
description: Sub-flow invocado desde generar-pom.md paso 11 (post-smoke exitoso). Analiza POMs + spec del Test recién creado, propone screenshots automáticos en puntos clave (botones de confirmación, pantallas principales), confirma con el QA y aplica los cambios al PO + sidecar + nodos.json + traza.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Auto-insertar screenshots tras smoke exitoso

Sub-flow opt-in invocado desde `generar-pom.md` paso 11 cuando el smoke test pasó. Por diseño **no se ejecuta durante el create**: el create se mantiene liviano (solo modelado del flujo) y los screens se ofrecen sobre un Test que ya sabemos que anda.

## Inputs

- `specPath`: ruta del spec recién generado (ej: `tests/dolarMep-12345.spec.ts`).
- `slug`: slug del test set.
- `numero`: testId del caso.

## 1. Cargar estado

1. Leé el spec y parseá los `await {pom}.{metodo}(...)` para reconstruir la cadena de llamadas.
2. Leé `.autoflow/recordings/{numero}-path.json` para tener la traza ordenada de nodos.
3. Leé `.autoflow/nodos.json` para resolver cada id de la traza.
4. Para cada Page Object referenciado por el spec (`pages/*.ts`), leé el archivo.

## 2. Identificar puntos candidatos

Aplicá las heurísticas A y B + las reglas de anti-spam de [`.autoflow/conventions/screens-rules.md`](../conventions/screens-rules.md) (sección **Heurísticas de auto-inserción** — regex y reglas completas viven ahí, no duplicar acá).

**Si las heurísticas no encuentran ningún candidato, decilo honesto** ("No detecté botones de confirmación ni pantallas principales claras — si querés agregar screens manuales usá la opción 📸 desde editar-caso") y volvé al menú sin tocar archivos.

## 3. Mostrar la propuesta al QA — con preview

Mostrá una lista numerada de TODOS los puntos candidatos detectados, agrupados por método del PO:

```
📸 Encontré N puntos candidatos para screenshots automáticos:

  pages/LoginPage.ts → ingresar(usuario, password)
    [1] ANTES del click "Log in"        → label "LoginPage-pre-login"
    [2] DESPUÉS del click "Log in"      → label "LoginPage-post-login"

  pages/HomePage.ts → elegirProducto(producto)
    [3] DESPUÉS del click producto       → label "HomePage-producto-elegido"

  pages/CheckoutPage.ts → confirmar(datos)
    [4] ANTES del click "Purchase"      → label "CheckoutPage-pre-purchase"
    [5] DESPUÉS del click "Purchase"    → label "CheckoutPage-post-purchase"

Total: N screens. ¿Cómo seguimos?
```

`vscode/askQuestions` single-select:

- `✅ Aplicar todos` → seguí al paso 4.
- `✂️ Elegir cuáles aplicar` → abrí un `multi-select` con cada candidato como opción (label corto + ubicación). Aplicá solo los tildados.
- `❌ Cancelar` → volvé a `generar-pom.md` sin tocar nada.

## 4. Aplicar los cambios

Por cada candidato aprobado, aplicá las **4 mutaciones atómicas** documentadas en [`.autoflow/conventions/screens-rules.md`](../conventions/screens-rules.md) → sección **Reglas de mutación atómica** (caso "agregar"):

1. **Page Object**: agregar import de `screen` si falta + insertar `await screen(this.page, '{label}')` en la posición resuelta por la heurística (antes/después del click, o al final del método).
2. **`nodos.json`**: agregar el nodo si el id no existe (shape en `screens-rules.md`).
3. **Sidecar** (`.autoflow/fingerprints/{NombrePage}.json`): sumar el id al final de `nodos[]`. Sin duplicar.
4. **Traza** (`.autoflow/recordings/{numero}-path.json`): insertar el id en `path[]` en la posición correspondiente.

## 5. Cierre

Mostrale al QA un resumen:

```
✅ Aplicados K screens en M método(s):
  • pages/LoginPage.ts → ingresar()     +2 screens
  • pages/HomePage.ts → elegirProducto()  +1 screen
  • pages/CheckoutPage.ts → confirmar()   +2 screens

  Total nodos `capturar-screen` agregados: K
  Archivos tocados: pages/*.ts, fingerprints/*.json, recordings/{numero}-path.json, nodos.json
```

Volvé a `generar-pom.md` paso 11 (la pregunta post-smoke se reabre). El QA puede correr el Test ahora con screens incluidos para validar.

## Notas

- **No se vuelve a correr el smoke** automáticamente — la inserción es solo en código, los screens recién se materializan en la próxima corrida.
- **Las heurísticas son best-effort**. Si el QA quiere screens en puntos que la heurística no detectó, los agrega después vía `editar-caso.md → 📸 Insertar screenshot`.
- **Idempotencia**: si el QA dispara este sub-flow dos veces sobre el mismo Test, los candidatos que ya tienen su `screen()` en el código se detectan (la línea ya está) y se omiten del propose, no se duplican.
