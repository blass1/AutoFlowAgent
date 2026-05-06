---
mode: agent
description: Agrega pasos al final de un caso existente sin re-grabar. El QA pega HTML + elige la acción y el agente construye el código.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Append manual (HTML + acción)

Sub-flow invocado desde `editar-caso.md`. El QA quiere extender un caso ya grabado sin volver a navegar la web. Pega el HTML del elemento target y elige qué acción ejecutar; el agente arma el selector idiomático, el código del PO y la línea del spec.

Cuando arranca, ya tenés:
- `numero` del caso elegido
- ruta del spec (`tests/{archivo}.spec.ts`)
- el sidecar de cada page involucrada y `nodos.json` cargados

Si llegaste sin esos datos, pediselos al QA antes de seguir.

## 1. Cargar contexto

Igual al paso 1 de [insertar-nodo-especial.md](insertar-nodo-especial.md):
- Leé el spec, el `path.json`, `nodos.json` y todos los sidecars de las pages que aparecen en el path.
- Construí en memoria la lista ordenada `pasos[]` con `{ indice, id, page, accion, label }`.
- Cargá los locators existentes de cada PO involucrado (lectura del `pages/{Page}.ts`) — el agente los usa después para razonar sobre el HTML.
- Leé `.autoflow/recordings/{numero}-session.json` y anotá `bufferTiempo` (puede no estar; tratalo como `false` si falta). Vas a usarlo en el paso 3.g al emitir métodos nuevos del PO: si está en `true`, después de cada `pressSequentially(...)` dentro del método agregás `await this.page.waitForTimeout(500); // Wait: buffer anti-solape (heredado del Test fuente)`.

## 2. Punto de inserción

Por default agregás al final del caso. Solo abrís la lista completa si el QA lo pide explícitamente.

`#tool:vscode/askQuestions` single-select: `"¿Dónde inserto los pasos nuevos?"` con dos opciones:
- `✅ Después del último paso ({Page} :: {accion} :: {label})` — donde `{Page}/{accion}/{label}` describen el último paso del caso.
- `📋 Elegir otro punto de inserción`

Si elige la primera, `indiceInsercion = pasos.length` y la **page activa** es la del último paso. Saltá al paso 3.

Si elige la segunda, abrí un segundo `vscode/askQuestions` single-select con la lista numerada completa de pasos del caso, formato `{N}. [{page}] {accion} {label}`. Guardá `indiceInsercion` (entero) y la page activa al momento de la inserción es la del paso elegido.

## 3. Loop de construcción

Repetí esta secuencia mientras el QA quiera sumar pasos. Cada vuelta agrega **un paso** y aplica los cambios al instante.

### 3.a. Acción

`vscode/askQuestions` single-select: `"¿Qué hace este paso?"`:
- `👆 click`
- `⌨️ fill (escribir en un input)`
- `☑️ check (tildar)`
- `☐ uncheck (destildar)`
- `⏎ press (tecla)`
- `📋 selectOption (dropdown)`
- `🖱️ hover`
- `🔗 goto (navegar a una URL)`
- `✓ assert (verificar algo)`
- `🎯 capturar valor` → carga [insertar-nodo-especial.md](insertar-nodo-especial.md) en modo `capturar` con `indiceInsercion = paso actual`. Al volver, seguí el loop.
- `🔍 verificar valor` → idem para `verificar`.
- `✅ Terminar y cerrar`

### 3.b. Si la acción es `goto`

Pedí solo: `"URL (absoluta o relativa al base URL)"` → text input.
- Locator: `goto:{url}` (sin selector real, igual que el resto de gotos del proyecto).
- Page destino: la **page activa** del paso anterior (los `goto` no cambian de page por sí solos en el modelo de nodos, pero abrí single-select por si el QA quiere asignarlo a otra page del recording o crear una nueva).
- Saltá al paso 3.f (resumen y aplicar).

### 3.c. Si la acción es `assert`

Carrousel:
1. `"Pegá el HTML del elemento que querés verificar (vacío si es assert a nivel page)"` → text input multiline.
2. `"Matcher"` → single-select: `toBeVisible` / `toBeHidden` / `toHaveText` / `toContainText` / `toHaveValue` / `toHaveURL` / `toHaveTitle` / `toHaveCount`.
3. `"Valor esperado (si el matcher lo necesita)"` → text input opcional.

Si el matcher es `toHaveURL`/`toHaveTitle` o el HTML quedó vacío, marcá el assert como **page-level** (`selector: "page"`).

Saltá al paso 3.e.

### 3.d. Acciones con HTML target (`click`, `fill`, `check`, `uncheck`, `press`, `selectOption`, `hover`)

Carrousel:
1. `"Pegá el bloque HTML del elemento target (incluí contenedor padre si hay ambigüedad)"` → text input multiline.
2. **Valor**, solo si la acción lo requiere:
   - `fill` → `"¿Qué texto se escribe?"` (acepta el placeholder `*` para "dato variable" igual que el flujo de `crear-caso`).
   - `press` → `"¿Qué tecla? (ej: Enter, Tab, Escape)"`.
   - `selectOption` → `"¿Qué opción se selecciona?"`.

### 3.e. Construcción del locator

Razoná sobre el HTML pegado + la acción + los locators existentes en la PO destino para proponer un locator idiomático. Reglas (mismas que la rama HTML+intent de `insertar-nodo-especial.md`):

- Preferí `getByRole`/`getByText`/`getByLabel`/`getByPlaceholder` sobre CSS crudo.
- Si hay múltiples matches, encadená `.filter({ hasText: ... })` o `.filter({ has: page.getByText(...) })` hasta hacer match único.
- Si hay `data-testid` o atributos estables, usalos (`getByTestId`).
- Si el HTML traído no alcanza para desambiguar, **decilo al QA** y pedile más contexto antes de avanzar.

Determiná la **page destino**:
- `vscode/askQuestions` single-select con la lista de pages del recording + `🆕 Nueva page (PascalCase)`.
- Si elige nueva, pedí el nombre en text input. Validá PascalCase y que no choque con pages existentes.

### 3.f. Resumen y confirmar

Mostrale al QA el bloque concreto que se va a aplicar:

```
Voy a agregar después del paso {indiceInsercion}:

  [{Page}] {accion} {label}
    Locator: {locatorPropuesto}
    Código:  await {pageVar}.{nombreLocator}.{metodo}({valor opcional});

Archivos que voy a tocar:
  • pages/{Page}.ts      (sumo locator privado)
  • tests/{archivo}.spec.ts (inserto la línea)
  • .autoflow/nodos.json   (sumo nodo {id})
  • .autoflow/fingerprints/{Page}.json (sumo id al sidecar)
```

`vscode/askQuestions` single-select: `"¿Confirmás?"`:
- `✅ Aplicar`
- `🔁 Probar otra vez` → text input pidiendo qué falló (texto repetido, contenedor distinto, etc.) y volvé a 3.e con más contexto.
- `📝 Ajusto el locator a mano` → text input para que el QA pegue su versión final.
- `❌ Descartar este paso` → vuelve al paso 3.a sin tocar nada.

### 3.g. Aplicar

1. **Page Object** (`pages/{Page}.ts`):
   - Si el locator es nuevo, sumá `private readonly {locName}: Locator;` y la asignación en el constructor (`selectorRaw` verbatim).
   - Si el método público que cubre estos pasos no existe, sumá uno con verbo en infinitivo y JSDoc de una línea. Si existe pero está incompleto, extendelo agregando la línea nueva al final del método. Para `fill`, emití `pressSequentially` (ver `pom-rules.md`).
2. **Spec** (`tests/{archivo}.spec.ts`):
   - Insertá la llamada al método del PO en el lugar exacto (justo después del paso `indiceInsercion`).
   - Si el paso es la primera acción de una page nueva, instanciala (`const xPage = await pageAnterior.metodoQueLleva()`). Si la page no se llega por método (ej: el QA acaba de crear una page nueva sin método de transición), instancialá directo: `const xPage = new XPage(page);`.
   - Si el método del PO ahora retorna otra page, asegurate de que la firma (`Promise<OtraPage>`) y la instanciación en el spec estén consistentes.
3. **`nodos.json`**: sumá el id nuevo si no existe. Si el id ya existe, validá que `accion`/`selector`/`page` coincidan; si no, frená y avisá.
4. **Sidecar** `.autoflow/fingerprints/{Page}.json`: sumá el id en `nodos[]` (o en `asserts[]` si la acción es `assert`) en la posición que corresponde.
5. **Persistencia del HTML**: guardá `.autoflow/captures/{numero}/append-{ts}-{accion}.json` con `{ html, accion, valor, locatorPropuesto, locatorFinal, razonamiento, pageDestino }`. Sirve para que `actualizar-nodos.md` después pueda repararlo si el front cambia.
6. Avanzá `indiceInsercion += 1` (próximo paso se inserta después de éste) y `pageActiva` si la page cambió.
7. `vscode/askQuestions` single-select: `"¿Sumamos otro paso o terminamos?"`:
   - `➕ Sumar otro paso` → vuelve a 3.a.
   - `✅ Terminar` → sale del loop al paso 4.

## 4. Cierre

1. Regenerá la traza con `runCommands`:
   ```
   node .autoflow/scripts/generar-traza.js {numero}
   ```
2. Regenerá los grafos:
   ```
   node .autoflow/scripts/grafo.js
   node .autoflow/scripts/grafo-nodos.js
   ```
3. Mostrale al QA un cierre corto:
   ```
   ✅ Listo. Añadí {N} pasos al **Test** [testId:{numero}].
      Te recomiendo correr el caso para verificar:
      npm run run:test -- tests/{archivo}.spec.ts
   ```
4. `vscode/askQuestions` single-select: `"¿Algo más?"`:
   - `▶️ Correrlo ahora`
   - `↩️ Volver a editar-caso`
   - `🏠 Volver al menú`

## Limitaciones a tener en cuenta

- **Sin verificación visual durante la construcción**: el QA no ve el front mientras arma los pasos. Si el HTML pegado no alcanza para desambiguar, el agente puede armar un locator que falla en la corrida. Por eso el modo es complementario al **🎬 Regrabar todo desde cero** (que sí navega la web), no reemplazo.
- **HTML "sucio"**: si el QA pega un blob minificado o muy largo, la calidad del locator propuesto baja. Sugerile pegar el contenedor mínimo que aísla el elemento (típicamente el padre directo más cercano que tenga un atributo estable).
