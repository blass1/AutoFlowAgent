---
mode: agent
description: Sub-flow de editar-caso. Inserta un screenshot manual en un paso elegido del Test, registrando el nodo `capturar-screen` en nodos.json + sidecar de la page y agregando la llamada al helper `screen(...)` en el método del PO correspondiente.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Insertar screenshot en un paso

Sub-flow invocado desde `editar-caso.md → 📸 Screenshots → ➕ Agregar un screenshot`. Acompaña a los screens automáticos que ofrece `auto-insertar-screens.md` post-smoke — el QA usa este flujo cuando quiere uno adicional en un punto específico.

Reglas canónicas del nodo `capturar-screen` (helper, shape, slug, idempotencia, mutaciones atómicas) → [`.autoflow/conventions/screens-rules.md`](../conventions/screens-rules.md). Este prompt se ocupa solo de la interacción con el QA y la edición.

## Inputs

- `numero` (testId del **Test** a editar).
- `specPath` (ruta del spec).

## 1. Leer estado

1. Parseá el spec → encontrá el `test('... [testId:${numero}]', ...)` y sus llamados a métodos del PO (`await loginPage.ingresar(...)`, `await homePage.elegirProducto(...)`, etc.).
2. Cargá `.autoflow/recordings/{numero}-path.json` → traza ordenada de ids de nodo (la fuente de verdad del paso a paso).
3. Cargá `.autoflow/nodos.json` para resolver cada id de la traza a su nodo.
4. Si falta el spec o el `path.json`, frená y avisale al QA con instrucciones de regenerar la traza (`validar-trazas.md`).

## 2. Mostrar pasos numerados al QA

Reconstruí un listado uno-a-uno como el de `generar-pom.md` paso 4 — un paso por fila, con número, page, acción humanizada y locator corto:

```
Pasos del Test [testId:{numero}]:
  1. HomePage  · click  · getByRole('link', { name: 'Log in' })
  2. LoginPage · fill   · getByLabel('Usuario')
  3. LoginPage · fill   · getByLabel('Contraseña')
  4. LoginPage · click  · getByRole('button', { name: 'Ingresar' })
  5. HomePage  · click  · getByRole('link', { name: 'Samsung galaxy s6' })
  6. ProductPage · click · getByRole('link', { name: 'Add to cart' })
  ...
```

Los nodos `capturar-screen` que ya existan se muestran con prefijo 📸 y NO son seleccionables (no insertar screen sobre un screen).

## 3. Preguntar dónde y con qué label

`vscode/askQuestions` con dos preguntas en un **carousel** (una sola llamada):

1. `"¿Después de qué paso querés capturar el screenshot?"` → single-select. Lista los pasos del 1 al N (cada opción es un paso completo del listado de arriba). El screen se inserta **después** de ese paso.
2. `"¿Qué label le ponemos? (va al filename y al PDF como caption — ej: 'HomePage-tras-login')"` → text input.

Validá el label: kebab-case-friendly (letras, números, `-`, `_`). Si tiene espacios o caracteres especiales, el sub-flow los normaliza para el id del nodo (slug), pero el label original queda intacto para el filename y la caption.

## 4. Resolver la page del paso

El paso N elegido tiene un nodo asociado en la traza. La `page` del nodo (campo `page` en `nodos.json`) define **a qué PO le insertás la llamada `screen()`**. Ej: si el paso 5 es `HomePage::click::...`, el screen se inserta en un método de `pages/HomePage.ts`.

Si el paso N es el último de un método (ej: el click de "Ingresar" cierra el método `loginPage.ingresar()`), el screen va **al final del método** justo antes del `return` (o antes del `waitForLoadState` si lo hay). Si está en el medio (raro pero posible si el método tiene varios pasos), va **inmediatamente después** de la línea correspondiente a ese paso.

## 5. Aplicar los cambios

Las 4 mutaciones atómicas viven en [`.autoflow/conventions/screens-rules.md`](../conventions/screens-rules.md) → sección **Reglas de mutación atómica** (caso "agregar"). Resumen para este flujo:

1. **PO** (`pages/{NombrePage}.ts`): agregar import de `screen` desde `../fixtures` si falta + insertar `await screen(this.page, '{label}');` en la **posición resuelta en el paso 4** (después del paso N del spec elegido por el QA, dentro del método del PO correspondiente).
2. **`nodos.json`**: agregar el nodo si el id `{NombrePage}::capturar-screen::{slug}` no existe. Si ya existe (mismo label en la misma page), reusalo.
3. **Sidecar** (`.autoflow/fingerprints/{NombrePage}.json`): sumar el id al final de `nodos[]` si no estaba.
4. **Traza** (`.autoflow/recordings/{numero}-path.json`): insertá el id en `path[]` **después** del id del paso N elegido.

> No agregues comentarios arriba de la línea `screen()` — el nombre del helper ya documenta el intento.

## 6. Cierre

Mostrale al QA un resumen corto:

```
✅ Screenshot insertado:
   • Método del PO:   pages/{NombrePage}.ts → {nombreMetodo}()
   • Paso en el spec: después del paso {N}
   • Label:           {label}
   • Nodo ID:         {NombrePage}::capturar-screen::{slug}
   • Archivo destino: runs/{ts}/screens/{numero}/{label}_DD_MM_YYYY_HH_MM_SS.jpg
                       (se genera en la próxima corrida del Test)
```

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `📸 Insertar otro screenshot`
- `🏠 Volver al menú`

## Notas

- **Idempotente**: si el QA insertó accidentalmente el mismo screen dos veces (mismo paso, mismo label), el segundo intento se detecta (la línea `await screen(this.page, 'X')` ya está en el método justo después del paso N) y se avisa sin tocar archivos.
- **No regenerar el PO completo**: solo se inserta la línea + import. Cero regrabación.
- **No participa del matcheo de pages** (paso 3 de `generar-pom.md`): los nodos `capturar-screen` viven en `sidecar.nodos[]` pero el matcheo ignora la acción `capturar-screen` cuando compara firmas — son metadata de evidencia, no comportamiento del flujo.
