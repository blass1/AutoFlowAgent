---
mode: agent
description: Construye una operación sobre un item específico de una lista (tabla, cards, lista de cuentas) que cumple criterios concretos. Filtra por contenido — no por posición — y parametriza los criterios como args del método. Soporta click+submenú, validar existencia y validar no-existencia.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Acción filtrada en lista

Sub-flow invocado desde `editar-caso.md` cuando el QA necesita operar sobre **un item específico de una lista** que cumple criterios concretos. Casos típicos:

- Click en los 3 puntitos de "la suscripción Fima de hoy con monto $100.000" → `Cancelar`.
- Validar que existe un plazo fijo de fecha=hoy + monto=X.
- Validar que NO existe un movimiento de fecha=ayer (porque se canceló).

El método generado **filtra la fila por contenido** (combinando hasta 5 `.filter({ hasText })`), no por posición. Robusto a cambios de orden de los items en el front.

Cuando arranca, ya tenés (desde `editar-caso.md`):
- `numero` del **Test** elegido
- ruta del spec (`tests/{archivo}.spec.ts`)

## 1. Cargar contexto del caso

Igual al paso 1 de [insertar-nodo-especial.md](insertar-nodo-especial.md):
- Leé el spec, el `path.json`, `nodos.json` y los sidecars de las pages que aparecen en el path.
- Construí en memoria la lista ordenada `pasos[]` con `{ indice, id, page, accion, label }`.

## 2. Elegir punto de inserción

`#tool:vscode/askQuestions` single-select: `"¿Después de qué paso insertás la operación filtrada?"` con la lista numerada de pasos (igual al paso 2 de `insertar-nodo-especial.md`). Guardá `indiceInsercion`.

## 3. Tipo de acción

`vscode/askQuestions` single-select: `"¿Qué hacés sobre la fila filtrada?"`:
- `🎯 Click en menú de la fila (3 puntitos + submenú)`
- `✓ Validar que la fila exista (sea visible)`
- `🚫 Validar que la fila NO exista`

Anotá `tipoAccion ∈ { 'click-en-menu', 'validar-existe', 'validar-no-existe' }`.

## 4. HTML de la lista

`vscode/askQuestions` text input multiline: `"Pegá el HTML de la lista. Incluí al menos 2-3 filas para que vea la estructura repetitiva (no solo la fila objetivo)."`.

> Si el QA pega solo una fila, decile que necesitás más contexto (las filas similares te ayudan a inferir el rol/role accesible y los textos que repiten).

Razoná sobre el HTML para identificar:
- El **rol/role accesible** del contenedor de cada item (`row`, `listitem`, `article`, `option`, etc.).
- Los **textos** que aparecen en cada fila — la base del filtro.
- Si hay un botón de "más opciones" / "..." / kebab por fila (solo aplica si `tipoAccion === 'click-en-menu'`).

## 5. Criterios de filtro (hasta 5)

`vscode/askQuestions` carousel:

1. `"¿Cuántos criterios necesitás para identificar la fila?"` → single-select con opciones `1`, `2`, `3`, `4`, `5`. Mín 1, máx 5.

Después, **por cada criterio** (en otro carousel con N×3 inputs):
1. `"Criterio {n}: nombre (camelCase, va a ser el nombre del parámetro)"` — text input. Validá `^[a-z][a-zA-Z0-9]*$`. Ejemplos: `fecha`, `monto`, `nombreFondo`, `cuentaOrigen`.
2. `"Criterio {n}: tipo TypeScript"` — single-select: `string` / `number` / `Date` (se convierte a string ISO en el filter).
3. `"Criterio {n}: valor de ejemplo (lo que se ve en la fila del HTML que pegaste)"` — text input. Sirve para mostrarle al QA en el preview cómo va a quedar el filter.

## 6. Si el tipo es `🎯 Click en menú de la fila` — pedir HTML del submenú

`vscode/askQuestions` text input multiline: `"Pegá el HTML del submenú (los 3 puntitos abiertos), mostrando todas las opciones disponibles."`.

Después, single-select: `"¿Qué opción del submenú clickeás?"` con cada opción detectada en el HTML como una alternativa (texto del menuitem). Anotá `accionFinal` (texto literal, ej: `Cancelar suscripción`).

También razoná sobre el HTML para identificar el rol del botón de los 3 puntitos. Típicamente `getByRole('button', { name: 'Más opciones' })` o `getByRole('button', { name: 'Acciones' })`. Si el botón tiene solo un ícono, vas a tener que usar `aria-label` (mostrale al QA el locator que estás armando antes de aplicar).

## 7. Razonar y armar el método

### 7.a. Construir el locator de la fila

Combiná los criterios en filters encadenados:

```ts
const fila = this.page
  .getByRole('{rolDeFila}')                          // row | listitem | article | option | etc.
  .filter({ hasText: {criterio1} })
  .filter({ hasText: String({criterio2}) })          // String() si es number
  .filter({ hasText: {criterio3} });
```

Para `Date` → convertir a string formateado (ej: si la fila muestra `"29/05/2026"`, el método recibe el Date y formatea con `toLocaleDateString('es-AR')`). Si el QA no sabe el formato, pedile que lo muestre desde el HTML pegado.

### 7.b. Construir el cuerpo del método según `tipoAccion`

**Si `click-en-menu`** — método que retorna `Promise<void>`:

```ts
async {nombreMetodo}({param1}: {tipo1}, {param2}: {tipo2}, ...): Promise<void> {
  const fila = this.page.getByRole('{rolDeFila}')
    .filter({ hasText: {param1} })
    .filter({ hasText: String({param2}) });
  await fila.getByRole('button', { name: '{nombreBotonMenu}' }).click();
  await this.page.getByRole('menuitem', { name: '{accionFinal}' }).click();
  await this.page.waitForLoadState('domcontentloaded');
}
```

> Importante: `getByRole('menuitem')` se busca **a nivel page**, no dentro de la fila — los submenús abren en un overlay/portal fuera del DOM de la fila.

**Si `validar-existe`** — método que retorna `Promise<void>`:

```ts
async {nombreMetodo}({param1}: {tipo1}, ...): Promise<void> {
  const fila = this.page.getByRole('{rolDeFila}')
    .filter({ hasText: {param1} })
    .filter({ hasText: String({param2}) });
  await expect(fila).toBeVisible();
}
```

**Si `validar-no-existe`**:

```ts
async {nombreMetodo}({param1}: {tipo1}, ...): Promise<void> {
  const fila = this.page.getByRole('{rolDeFila}')
    .filter({ hasText: {param1} })
    .filter({ hasText: String({param2}) });
  await expect(fila).toHaveCount(0);
}
```

### 7.c. Inferir el nombre del método

- `click-en-menu` con `accionFinal === 'Cancelar suscripción'` → `cancelarSuscripcion` (verbo + sustantivo).
- `click-en-menu` con `accionFinal === 'Renovar plazo fijo'` → `renovarPlazoFijo`.
- `validar-existe` → `verificar{X}Existe` o `verificarExiste{X}`. Pedile al QA que confirme el nombre con `vscode/askQuestions` text input prefilled con la sugerencia.
- `validar-no-existe` → `verificar{X}NoExiste`.

### 7.d. Determinar la `page` destino

`vscode/askQuestions` single-select con la lista de pages del recording — `"¿A qué Page Object pertenece esta operación?"`. Típicamente la page actual del flujo (la última que tocó el QA antes de este paso).

## 8. Preview y confirmar

Mostrale al QA un bloque concreto:

```
🎯 Voy a insertar después del paso {indiceInsercion}:

  Método nuevo en {Page}:
    async cancelarSuscripcionFima(fecha: string, monto: number): Promise<void> {
      const fila = this.page.getByRole('row')
        .filter({ hasText: fecha })
        .filter({ hasText: String(monto) });
      await fila.getByRole('button', { name: 'Más opciones' }).click();
      await this.page.getByRole('menuitem', { name: 'Cancelar suscripción' }).click();
      await this.page.waitForLoadState('domcontentloaded');
    }

  Línea del spec:
    await fondosFimaPage.cancelarSuscripcionFima(fecha, monto);

  Archivos que voy a tocar:
    • pages/FondosFimaPage.ts (sumo método)
    • tests/{archivo}.spec.ts (inserto la línea)
    • .autoflow/nodos.json (sumo nodo `accionEnLista`)
    • .autoflow/fingerprints/FondosFimaPage.json (sumo id al sidecar)
    • .autoflow/recordings/{numero}-path.json (sumo id al path)
    • data/data-{slug}.ts (los criterios `fecha` y `monto` deberían vivir acá si querés
      que el spec los pase con valores reales — confirmame en la próxima)
```

`vscode/askQuestions` single-select: `"¿Confirmás?"`:
- `✅ Aplicar`
- `✏️ Ajustar el locator de la fila` → text input para que el QA pegue su versión final del filter chain.
- `🔁 Probar otra alternativa` → text input pidiendo qué falló (el role no era `row`, faltó un filter, etc.) y volvés a 7.a.
- `❌ Cancelar`

### 8.a. Datos en el data file (post-confirmación de aplicar)

Pregunta al QA: `"Los criterios { {param1}, {param2}, ... } ¿de dónde salen al ejecutar el Test?"` con un single-select por **cada** criterio:
- `📦 Del data file (campo nuevo en data{PascalSlug})` → sumá el campo al data file con el valor de ejemplo.
- `📅 Calculado al vuelo (ej: fecha de hoy)` → en el spec, computá el valor inline antes de llamar al método. Ej: `const fechaHoy = new Date().toLocaleDateString('es-AR');`.
- `📝 Literal hardcodeado` → pasalo directo en la línea del spec.

## 9. Aplicación atómica (los 5 lugares o ninguno)

1. **Page Object** (`pages/{Page}.ts`): sumá el método con su firma + cuerpo. Si hay locators nuevos en el constructor (típicamente no, porque usamos `getByRole` directo), agregalos también.
2. **`nodos.json`**: agregá un nodo nuevo con shape específico de `accionEnLista`:
   ```json
   {
     "id": "FondosFimaPage::accionEnLista::cancelarSuscripcionFima",
     "page": "FondosFimaPage",
     "accion": "accionEnLista",
     "metodo": "cancelarSuscripcionFima",
     "tipoAccion": "click-en-menu",
     "criterios": [
       { "nombre": "fecha", "tipo": "string", "ejemplo": "29/05/2026" },
       { "nombre": "monto", "tipo": "number", "ejemplo": "100000" }
     ],
     "rolFila": "row",
     "selectorMenu": "getByRole:button:Más opciones",
     "accionFinal": "Cancelar suscripción",
     "confiabilidad": null
   }
   ```
   Para `validar-existe` / `validar-no-existe`, omití `selectorMenu` y `accionFinal`, agregá `matcher: "toBeVisible"` o `matcher: "toHaveCount-0"`.
3. **Sidecar** (`.autoflow/fingerprints/{Page}.json`): sumá el id al final de `nodos[]` (o a `asserts[]` si `tipoAccion ∈ { 'validar-existe', 'validar-no-existe' }`, ya que conceptualmente son verificaciones).
4. **Spec** (`tests/{archivo}.spec.ts`): insertá la llamada al método dentro de un nuevo `test.step` con comentario corto y concreto, justo después del paso `indiceInsercion`. Ej:
   ```ts
   await test.step('Cancelar la suscripción de hoy', async () => {
     await fondosFimaPage.cancelarSuscripcionFima(fechaHoy, importeOperacion);
   });
   ```
   Si el QA eligió "calculado al vuelo" para algún criterio, sumá la línea de cálculo arriba del bloque de instancias o al inicio del step.
5. **Data file** (`data/data-{slug}.ts`): si algún criterio viene del data, sumá los campos a la `interface Data{PascalSlug}` y al objeto `data{PascalSlug}`.
6. **Path histórico** (`.autoflow/recordings/{numero}-path.json`): insertá el id en la posición `indiceInsercion + 1` (después del paso elegido).

## 10. Cierre

Mostrale al QA un mensaje corto:

```
✅ Listo. Inserté la operación filtrada en el Test [testId:{numero}] (paso {indiceInsercion+1}).
   Te recomiendo correr el Test para verificar que el filter funciona con los datos:
   node .autoflow/scripts/run-test.js tests/{archivo}.spec.ts --headed --grep=\[testId:{numero}\]
```

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `🎯 Insertar otra operación filtrada en el mismo **Test**` → volvé al paso 2 (preservá el contexto cargado).
- `↩️ Volver a editar-caso`
- `🏠 Volver al menú`

## Reglas

- **El locator de la fila se construye desde page**, no desde otro locator del PO. Esto es porque las listas suelen ser dinámicas y querés que `getByRole('row')` consulte el DOM al momento de la llamada, no un locator pre-armado del constructor.
- **Filters por `hasText`**: simple y suficiente para 90% de los casos. Si el QA necesita filtrar por estructura más compleja (ej: por la fila que tiene un cierto botón), después extendemos a `.filter({ has: page.getByRole(...) })` — fuera del scope inicial.
- **Validar existencia con `toBeVisible()` vs `toHaveCount(>=1)`**: usamos `toBeVisible` porque también valida que sea visible al usuario. Si el QA necesita "existe pero puede no estar visible" (raro), pedile que lo confirme y emití `toHaveCount` en su lugar.
- **Frená si el HTML pegado no alcanza**: si después de razonar no encontrás un rol claro de fila o el botón de "más opciones" no aparece, decile al QA que pegue más HTML — no inventes locators.
- **No invocás `actualizar-nodos.md`** desde acá — si el filter falla en la corrida, el QA va al menú post-fallo del Test y de ahí dispara la reparación.
