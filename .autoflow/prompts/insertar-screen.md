---
mode: agent
description: Sub-flow de editar-caso. Inserta un screenshot manual en un paso elegido del Test, registrando el nodo `capturar-screen` en nodos.json + sidecar de la page y agregando la llamada al helper `screen(...)` en el método del PO correspondiente.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Insertar screenshot en un paso

Sub-flow invocado desde `editar-caso.md` cuando el QA elige `📸 Insertar screenshot en un paso`. Acompaña a los screens **automáticos** que `generar-pom.md` inserta durante la generación (ver `pom-rules.md` → "Nodo especial: `capturar-screen`") — el QA usa este flujo cuando quiere uno adicional en un punto específico.

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

### 5.1. Page Object — agregar `screen()`

1. Leé `pages/{NombrePage}.ts` (o `.ts` sin sufijo `Page` si es componente).
2. Si todavía no importa `screen` desde `../fixtures`, agregá al bloque de imports:
   ```typescript
   import { screen } from '../fixtures';
   ```
   Si ya importa otras cosas del fixture (`bufferEntreAcciones`, etc.), reusá el import: `import { bufferEntreAcciones, screen } from '../fixtures';`.
3. Insertá la línea `await screen(this.page, '{label}');` en el método y posición que resolviste en el paso 4. **No** agregues comentarios arriba — el nombre `screen` ya documenta el intento.

### 5.2. `nodos.json` — agregar nodo `capturar-screen`

Calculá el id: `{NombrePage}::capturar-screen::{slug}` donde `{slug}` es el label en kebab-case (lowercase, espacios → `-`, sin caracteres especiales).

Si el id no existe en `nodos.json`, agregalo:
```json
{
  "id": "HomePage::capturar-screen::tras-login",
  "page": "HomePage",
  "accion": "capturar-screen",
  "label": "tras-login",
  "selector": "page",
  "selectorRaw": "screen(page, 'tras-login')",
  "confiabilidad": null
}
```

Si ya existe (mismo label en la misma page), **no lo agregues de nuevo** — la llamada al `screen()` en el código no requiere id único en `nodos.json` (igual que cuando dos screens consecutivos del flujo auto comparten label).

### 5.3. Sidecar de la page

Editá `.autoflow/fingerprints/{NombrePage}.json`. Agregá el id al final de `nodos[]` (no a `asserts[]`). Si ya estaba, no dupliques.

### 5.4. Traza del Test

Editá `.autoflow/recordings/{numero}-path.json`. Insertá el id en `path[]` **después** del id del paso N elegido. La traza queda con un paso más, coherente con el código nuevo.

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
