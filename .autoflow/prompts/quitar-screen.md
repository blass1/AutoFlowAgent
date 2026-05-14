---
mode: agent
description: Sub-flow de editar-caso → Screenshots → Quitar. Borra un capturar-screen existente de un Test: saca la línea `screen()` del método del PO y la entrada del id en path.json. No toca nodos.json ni sidecar (otros Tests pueden seguir usándolo).
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Quitar screenshot de un Test

Sub-flow invocado desde `editar-caso.md → 📸 Screenshots → ➖ Quitar un screenshot del Test`. Es el inverso de `insertar-screen.md`.

Reglas canónicas del nodo `capturar-screen` (helper, shape, slug, mutaciones atómicas) → [`.autoflow/conventions/screens-rules.md`](../conventions/screens-rules.md). Este prompt se ocupa solo del listado, la confirmación y la edición de borrado.

## Inputs

- `numero` (testId del **Test** a editar).
- `specPath` (ruta del spec).

## 1. Leer estado

1. Cargá `.autoflow/recordings/{numero}-path.json` → traza ordenada de ids del Test.
2. Cargá `.autoflow/nodos.json` para resolver cada id de la traza a su nodo.
3. Filtrá los ids cuya `accion === 'capturar-screen'`. Esos son los candidatos a quitar.
4. Si no hay ningún `capturar-screen` en la traza, decile al QA: `El Test no tiene ningún screenshot. Si querés agregar uno, usá ➕ Agregar un screenshot a un paso del menú anterior.` Y volvé al menú.
5. Si falta el `path.json`, frená y avisale al QA con instrucciones de regenerar la traza (`validar-trazas.md`).

## 2. Mostrar los screens al QA

Para cada `capturar-screen` listado, mostrá:
- Posición en la traza (índice 1-based).
- `page` del nodo (de qué PO sale la llamada).
- `label` del nodo (preservando casing original).
- El paso **anterior** en la traza (acción + selector corto) para que el QA tenga contexto de dónde está parado el screen.

```
Screenshots del Test [testId:{numero}]:
  [3]  HomePage     · label "HomePage-post-login"       (después de: click "Log in" — LoginPage)
  [7]  HomePage     · label "HomePage-producto-elegido" (después de: click "Samsung galaxy s6" — HomePage)
  [11] CheckoutPage · label "CheckoutPage-pre-purchase" (después de: fill "Email" — CheckoutPage)
  [12] CheckoutPage · label "CheckoutPage-post-purchase"(después de: click "Purchase" — CheckoutPage)
```

`vscode/askQuestions` single-select: `"¿Qué screenshot querés sacar?"` con cada uno como opción + `❌ Cancelar`.

## 3. Resolver dónde está la llamada en el código

El screen elegido tiene `page` (ej: `HomePage`) y `label` (ej: `HomePage-post-login`). Esto define:

- **Archivo destino**: `pages/{NombrePage}.ts` (o sin sufijo `Page` si es componente).
- **Línea a borrar**: la única línea `await screen(this.page, '{label}');` (o `screen(this.page, '{label}')` sin `await` si así estuviera — improbable) que matchee literal el label.

Leé el PO. Si encontrás:
- **0 ocurrencias** → el código y la traza están desincronizados. Avisale al QA: `⚠ El nodo está en la traza pero la línea screen('{label}') no está en pages/{NombrePage}.ts. Probablemente alguien editó el PO a mano. Limpio igual la traza?` con single-select `🧹 Sí, limpiar solo la traza` / `❌ Cancelar`.
- **1 ocurrencia** → el caso normal. Avanzá al paso 4.
- **>1 ocurrencias** → la misma page tiene 2+ screens con el mismo label (ej: dos métodos distintos del PO usan `screen(this.page, 'HomePage-post-login')`). El nodo en la traza no identifica de qué método sale. Resolvé por **proximidad**: leé los métodos del PO referenciados en el spec en orden, contá la posición del screen en cada método, y cruzá con la posición en la traza. Si la heurística no es concluyente, abrí un single-select pidiendo al QA cuál borrar (mostrá nombre del método y nro de línea).

## 4. Confirmar antes de borrar

Mostrale al QA el "antes":

```
🗑️ Voy a borrar este screenshot:
   • Método del PO:  pages/{NombrePage}.ts → {nombreMetodo}() (línea {N})
   • Línea exacta:   await screen(this.page, '{label}');
   • Posición traza: índice {idx} (después del paso "{descripcionPasoAnterior}")
```

`vscode/askQuestions` single-select: `"¿Confirmás?"`:
- `✅ Sí, borrar`
- `❌ Cancelar`

## 5. Aplicar el borrado

Las **2 mutaciones** (siguiendo [screens-rules.md](../conventions/screens-rules.md) → caso "quitar"):

### 5.1. Page Object

1. Borrá la línea `await screen(this.page, '{label}');` del método identificado en el paso 3. Si quedó una línea en blanco que rompe el formato, normalizá los blancos circundantes (sin tocar otras líneas del método).
2. **Limpieza del import**: leé todo el archivo y contá si quedan más usos de `screen` (`await screen(`, `screen(this.page`). Si **no quedan**, borrá `screen` del bloque de imports:
   - Si era `import { screen } from '../fixtures';` solitario → borrá la línea entera.
   - Si era `import { bufferEntreAcciones, screen } from '../fixtures';` o similar → sacá solo `screen` (y la coma correspondiente).

### 5.2. Traza del Test

Editá `.autoflow/recordings/{numero}-path.json`. Borrá la entrada del id elegido en `path[]` (el índice exacto que mostraste en el paso 2). Si el id aparece más de una vez (mismo screen referenciado en dos puntos del flujo — caso muy raro pero posible), borrá **solo** la ocurrencia del índice elegido.

### 5.3. Lo que NO tocás

- **`nodos.json`**: el id puede estar siendo usado por otros Tests que pasan por la misma page. Borrarlo crearía dangling references en otras trazas.
- **Sidecar** (`.autoflow/fingerprints/{NombrePage}.json`): mismo motivo. El sidecar lista todos los `capturar-screen` que la page conoce; otro Test puede estar referenciándolos.

## 6. Cierre

Mostrale al QA un resumen corto:

```
✅ Screenshot quitado:
   • Método del PO:   pages/{NombrePage}.ts → {nombreMetodo}()
   • Label:           {label}
   • Posición traza:  índice {idx} (borrado)
   • Nodo en nodos.json y sidecar: intactos (puede seguir usándose en otros Tests)
```

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `➖ Quitar otro screenshot`
- `📸 Volver al menú de Screenshots`
- `🏠 Volver al menú principal`

## Notas

- **Idempotente**: si el QA dispara este sub-flow dos veces sobre el mismo screen, el segundo intento detecta que la línea ya no está en el PO y la entrada ya no está en la traza, y avisa sin tocar archivos.
- **No regenera el PO completo**: solo borra la línea + opcionalmente el import. Cero regrabación.
- **Los `.jpg` ya tomados en `runs/` no se borran** — son evidencia histórica de corridas pasadas. Solo se evita que se tomen en las próximas corridas.
- **Inverso de `insertar-screen.md`**: si querés re-agregar el screen después de borrarlo, andá a `editar-caso.md → 📸 Screenshots → ➕ Agregar` y elegí el mismo paso + label. El id se reutiliza si seguía en `nodos.json`.
