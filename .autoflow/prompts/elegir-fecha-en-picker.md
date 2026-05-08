---
mode: agent
description: Construye un método del Page Object que elige una fecha en un date picker, parametrizado por la fecha. Soporta input nativo `<input type="date">` y calendarios custom (con navegación de meses). La fecha viene como argumento del método — no hardcodeada.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Elegir fecha en date picker

Sub-flow invocado desde `editar-caso.md` cuando el QA necesita **elegir una fecha** en un selector de fechas y la fecha tiene que ser **parametrizable** (no hardcodeada). Casos típicos:

- "Fecha de vencimiento del plazo fijo" — variable según el escenario.
- "Fecha de transferencia programada" — viene del data file.
- "Fecha de hoy" — calculada al vuelo.
- "Fecha del próximo viernes hábil" — calculada en el spec.

El grabador captura un click en el día específico (`getByRole('button', { name: '29' })`), pero eso clavaría el Test al 29 — querés que el método reciba un `Date` o un string y elija el día correcto cada vez.

Cuando arranca, ya tenés (desde `editar-caso.md`):
- `numero` del **Test** elegido
- ruta del spec (`tests/{archivo}.spec.ts`)

## 1. Cargar contexto del caso

Igual al paso 1 de [insertar-nodo-especial.md](insertar-nodo-especial.md):
- Leé el spec, el `path.json`, `nodos.json` y los sidecars de las pages que aparecen en el path.
- Construí en memoria la lista ordenada `pasos[]` con `{ indice, id, page, accion, label }`.

## 2. Elegir punto de inserción

`#tool:vscode/askQuestions` single-select: `"¿Después de qué paso insertás la elección de fecha?"` con la lista numerada de pasos. Guardá `indiceInsercion`.

## 3. Tipo de date picker

`vscode/askQuestions` single-select: `"¿Qué tipo de date picker es?"`:
- `📅 Input nativo HTML5 (<input type="date">)`
- `📆 Calendario custom (con navegación de mes y botones por día)`
- `🔤 Input typeable (escribís la fecha y se valida)`

Anotá `tipoPicker ∈ { 'nativo' | 'custom' | 'typeable' }`. Cada tipo tiene un flujo distinto de pasos 4 y 5.

## 4. HTML del picker

`vscode/askQuestions` text input multiline: `"Pegá el HTML del date picker tal como aparece cuando está abierto (o el HTML del input si es nativo/typeable). Si es calendario custom, incluí el header con mes/año y al menos los botones de día."`.

Razoná sobre el HTML para identificar:

**Si `nativo`**:
- El input típicamente: `<input type="date" name="fechaVencimiento" id="fecha">`. Locator: `getByLabel('Fecha de vencimiento')` o `getByRole('textbox', { name: 'Fecha' })`.

**Si `custom`**:
- El **botón trigger** que abre el picker (suele ser un input o un botón al lado).
- El **header** que muestra el mes actual (ej: `<div class="picker-header">mayo 2026</div>`).
- Los **botones de navegación** entre meses (typically `aria-label="Mes anterior"` y `aria-label="Mes siguiente"`).
- Los **botones de día** dentro del calendario (typically `<button>29</button>` o `<button aria-label="29 de mayo de 2026">29</button>`).

**Si `typeable`**:
- El input al que tipeás.
- (Opcional) el dropdown de sugerencias que aparece al tipear.

## 5. Formato de fecha

`vscode/askQuestions` carrousel:

1. `"¿Cómo recibe el método la fecha?"` — single-select:
   - `📅 Date object (TypeScript Date)` — el QA pasa `new Date(...)` desde el spec.
   - `📝 String en formato específico` — el QA pasa un string ya formateado.

2. Si eligió **String**: `"¿En qué formato? (mostrame un ejemplo de la fecha del HTML que pegaste)"` — text input. Ejemplos: `dd/mm/yyyy`, `yyyy-mm-dd`, `dd-mm-yyyy`. El agente infiere el formato de parseo.

3. **Si `tipoPicker === 'custom'`**: `"¿Cómo se ve el header del mes en el calendario? Pegame el formato exacto."` — text input. Ejemplos: `mayo 2026`, `Mayo de 2026`, `05/2026`, `May 2026`. Esto es clave para la lógica de navegación entre meses (el método compara contra ese formato para saber cuándo parar).

## 6. Nombre del método y parámetro

`vscode/askQuestions` carrousel:

1. `"Nombre del método (camelCase, verbo + sustantivo)"` — text input. Sugerencias según el caso: `elegirFechaVencimiento`, `seleccionarFechaTransferencia`, `setFechaInicio`. Validá `^[a-z][a-zA-Z0-9]*$`.

2. `"Nombre del parámetro de fecha (camelCase)"` — text input. Sugerencias: `fecha`, `fechaVencimiento`, `fechaProgramada`. Validá `^[a-z][a-zA-Z0-9]*$`.

3. `"¿De dónde viene la fecha al ejecutar el Test?"` — single-select:
   - `📦 Del data file (campo nuevo en data{PascalSlug})` — sumá el campo al data file.
   - `📅 Calculada al vuelo (ej: hoy, próximo viernes, +30 días)` — el spec computa el valor antes de llamar al método. Ofrecé opciones comunes: hoy, mañana, dentro de 7 días, dentro de 30 días, custom (text input para que el QA escriba la expresión).
   - `📝 Literal hardcodeado` — pasalo directo en la línea del spec.

## 7. Razonar y armar el método

### 7.a. Si `tipoPicker === 'nativo'` (`<input type="date">`)

```ts
async {nombreMetodo}({nombreParam}: {tipo}): Promise<void> {
  // <input type="date"> usa formato ISO yyyy-mm-dd internamente.
  const valorISO = {convertirAISO};  // según el tipo de entrada
  await this.{nombreLocator}.fill(valorISO);
}
```

Donde `convertirAISO` depende del tipo:
- Si `Date`: `${nombreParam}.toISOString().slice(0, 10)`.
- Si `string` ya en `yyyy-mm-dd`: usalo directo.
- Si `string` en otro formato: parsealo (con un helper o `new Date(${nombreParam}).toISOString().slice(0, 10)`).

### 7.b. Si `tipoPicker === 'custom'` (calendario con navegación)

```ts
async {nombreMetodo}({nombreParam}: {tipo}): Promise<void> {
  // 1. Abrir el picker
  await this.{btnTrigger}.click();

  // 2. Convertir la fecha de entrada a piezas (mes, año, día)
  const fecha = {nombreParam} instanceof Date ? {nombreParam} : new Date({nombreParam});
  const mesObjetivo = '{formatoHeaderEjemplo}'  // construido a partir de fecha
    .replace('{mes}', meses[fecha.getMonth()])
    .replace('{año}', String(fecha.getFullYear()));

  // 3. Navegar al mes correcto comparando el header
  let intentos = 0;
  while ((await this.{headerMes}.textContent())?.trim() !== mesObjetivo) {
    if (intentos++ > 24) throw new Error(`No pude llegar al mes ${mesObjetivo}`);
    // Decidir adelante o atrás según comparación de Date
    const headerActual = (await this.{headerMes}.textContent())?.trim() ?? '';
    const fechaHeader = parsearHeader(headerActual);  // helper que el QA puede afinar
    if (fechaHeader < fecha) await this.{btnSiguienteMes}.click();
    else await this.{btnAnteriorMes}.click();
  }

  // 4. Click en el día
  await this.{dialogPicker}.getByRole('button', { name: String(fecha.getDate()) }).click();
}
```

> Mostrale al QA esta plantilla con los placeholders rellenados y aclaralo: `parsearHeader` es un helper local que vos podés afinar después si la lógica de navegación de meses no funciona perfecta — depende del formato del header que el front muestre.

Locators que se agregan al constructor:
- `btnTrigger`: el botón/input que abre el picker.
- `headerMes`: el elemento que muestra mes/año actual.
- `btnSiguienteMes` / `btnAnteriorMes`: navegación.
- `dialogPicker`: el contenedor del calendario (para scopear el `getByRole('button')` y no chocar con botones de día fuera).

### 7.c. Si `tipoPicker === 'typeable'`

```ts
async {nombreMetodo}({nombreParam}: {tipo}): Promise<void> {
  const valorFormateado = {formatear};  // según el formato pedido
  await this.{inputFecha}.click();
  await this.{inputFecha}.pressSequentially(valorFormateado);
  await this.{inputFecha}.press('Enter');  // o Tab — el QA elige
}
```

Si el typeable tiene un dropdown de sugerencias y querés clickear la sugerencia correcta (más robusto), pediselo al QA en una pregunta extra y armá:
```ts
  await this.{inputFecha}.pressSequentially(valorFormateado);
  await this.page.getByRole('option', { name: valorFormateado }).click();
```

## 8. Preview y confirmar

Mostrale al QA el método armado, los locators que vas a sumar al PO, la línea del spec, y los campos del data file (si aplica).

`vscode/askQuestions` single-select: `"¿Aplico?"`:
- `✅ Aplicar`
- `✏️ Ajustar a mano` → text input con el método armado prefilled para que el QA edite.
- `🔁 Volver atrás (cambiar tipo de picker, formato, etc.)` → vuelve al paso 3.
- `❌ Cancelar`

## 9. Aplicación atómica

1. **Page Object** (`pages/{Page}.ts`): sumá los locators nuevos al constructor + el método nuevo al final.
2. **`nodos.json`**: agregá un nodo nuevo con shape específico:
   ```json
   {
     "id": "PlazoFijoPage::elegirFecha::fechaVencimiento",
     "page": "PlazoFijoPage",
     "accion": "elegirFecha",
     "metodo": "elegirFechaVencimiento",
     "tipoPicker": "custom",
     "tipoEntrada": "Date",
     "formatoHeader": "mayo 2026",
     "selectorTrigger": "getByLabel:Fecha de vencimiento",
     "selectorHeader": "locator:.picker-header",
     "selectorSiguienteMes": "getByRole:button:Mes siguiente",
     "selectorAnteriorMes": "getByRole:button:Mes anterior",
     "confiabilidad": null
   }
   ```
3. **Sidecar** (`.autoflow/fingerprints/{Page}.json`): sumá el id al final de `nodos[]`.
4. **Spec** (`tests/{archivo}.spec.ts`): insertá la llamada en un nuevo `test.step` justo después del paso `indiceInsercion`. Si la fecha es calculada al vuelo, sumá la línea de cálculo arriba del bloque de instancias o al inicio del step.
5. **Data file** (`data/data-{slug}.ts`): si la fecha viene del data, sumá el campo a la `interface` y al objeto.
6. **Path histórico** (`.autoflow/recordings/{numero}-path.json`): insertá el id en la posición correcta.

## 10. Cierre

```
✅ Listo. Inserté la elección de fecha en el Test [testId:{numero}] (paso {indiceInsercion+1}).
   Tip: probá el Test con la fecha que pusiste. Si el calendario custom no llega
   al mes correcto, afiná el helper `parsearHeader` en {Page}.ts según el formato
   real del header del front.
```

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `📅 Insertar otra elección de fecha en el mismo **Test**` → volvé al paso 2.
- `↩️ Volver a editar-caso`
- `🏠 Volver al menú`

## Reglas

- **El método siempre recibe la fecha como parámetro** — nunca hardcodear el día/mes/año en el código del PO. Eso clava el Test a una fecha concreta y rompe en cuanto cambia.
- **Para calendarios custom**: la lógica de navegación entre meses es la parte frágil. El método tiene un límite de 24 intentos para evitar bucles infinitos si el formato del header cambia. Si falla, el QA afina `parsearHeader` o agrega más casos al regex.
- **`getByRole('button', { name: '29' })` puede chocar** con otros botones que tengan texto "29" en la página. Por eso el método scopea con `this.dialogPicker` antes de buscar.
- **No invocar `actualizar-nodos.md`** desde acá — si el método falla, el QA va al menú post-fallo del Test y de ahí dispara la reparación.
- **Frená si el HTML pegado no alcanza**: especialmente para `custom`, si no encontrás header de mes ni botones de navegación claros, decile al QA que pegue más HTML.
