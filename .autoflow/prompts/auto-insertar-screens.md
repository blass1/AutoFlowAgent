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

Aplicá las siguientes heurísticas sobre la traza y los POMs. **Si la heurística no encuentra ningún candidato, decilo honesto** ("No detecté botones de confirmación ni pantallas principales claras — si querés agregar screens manuales usá la opción 📸 desde editar-caso") y volvé al menú sin tocar archivos.

### Heurística A — Botón de confirmación

Por cada nodo `click` en la traza cuyo `selectorRaw` o `valor` matchee la regex **ampliada**:

```
/log\s*in|login|ingresar|iniciar\s*sesión|aceptar|continuar|confirmar|preparar|guardar|enviar|finalizar|pagar|comprar|submit|aplicar|agregar|sumar|avanzar|siguiente|buscar|registrar|crear|aprobar|firmar/i
```

Es un candidato a **2 screens** — uno antes del click, uno después.

### Heurística B — Pantalla principal post-navegación

Si un método del PO dispara navegación (lo detectás porque tiene `waitForLoadState('domcontentloaded')` al final, o porque el sidecar tiene `conecta: [{ destino: 'X' }]`) Y la page destino matchea:

```
/home|overview|dashboard|main|inicio|principal|menú|landing/i
```

Es un candidato a **1 screen** al final del método (después del `waitForLoadState`).

### Anti-spam

- **Nunca propongas 2 screens consecutivos** sin acción del usuario en el medio. Si la heurística A "antes del click X" choca con la heurística A "después del click X-1" (clicks de confirmación seguidos), proponé uno solo — preferí el "después del previo".
- **No propongas screens en métodos que solo verifican** (cuerpo único `expect(...).toBeVisible()` etc.). Esos asserts ya son evidencia funcional; un screen ahí es ruido.

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

Por cada candidato aprobado, ejecutá la misma lógica que `insertar-screen.md` (paso 5):

### 4.1. Page Object

1. Si el PO no importa `screen` aún, agregá al bloque de imports:
   ```typescript
   import { screen } from '../fixtures';
   ```
   Si ya importa `bufferEntreAcciones` u otra cosa de `../fixtures`, reusá el import: `import { bufferEntreAcciones, screen } from '../fixtures';`.
2. Insertá `await screen(this.page, '{label}');` en el método, en la posición correspondiente (antes/después del click identificado, o al final del método según la heurística).

### 4.2. `nodos.json`

Calculá `id = {NombrePage}::capturar-screen::{slug-del-label}` (slug = kebab-case del label). Si no existe, agregalo:

```json
{
  "id": "LoginPage::capturar-screen::login-page-pre-login",
  "page": "LoginPage",
  "accion": "capturar-screen",
  "label": "LoginPage-pre-login",
  "selector": "page",
  "selectorRaw": "screen(page, 'LoginPage-pre-login')",
  "confiabilidad": null
}
```

### 4.3. Sidecar de la page

Editá `.autoflow/fingerprints/{NombrePage}.json`: sumá el id al final de `nodos[]` (no a `asserts[]`). Sin duplicar.

### 4.4. Traza del Test

Editá `.autoflow/recordings/{numero}-path.json`: insertá el id en `path[]` en la posición correspondiente (justo después del id del paso al que sigue el screen, o al final del bloque del método según la heurística).

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
