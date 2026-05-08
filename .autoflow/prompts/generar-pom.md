---
mode: agent
description: Después de cerrar el navegador de grabación, muestra los pasos capturados y los agrupa interactivamente con el QA en Page Objects, reconociendo pages que ya existen.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Generar Page Objects (agrupación interactiva)

Se carga cuando vuelve el control después de la grabación (la task `autoflow:start-recording` retornó porque el QA cerró el navegador).

## 0. ¿Modo añadir pasos?

Leé `.autoflow/recordings/{numero}-session.json`. Si tiene `"modo": "append"` (flag interno del flujo de **añadir pasos al final del Test**), **saltás todo el flujo normal** y vas al **Bloque AÑADIR PASOS** al final de este prompt. En este modo no se generan **Page Objects** nuevos ni **Test Sets** nuevos: se mergean los pasos al spec existente reusando los locators que ya están.

Si no hay `modo` o es `"crear"` (o cualquier otro valor), seguí con el flujo normal del paso 1 en adelante.

## 1. Cerrar la sesión

Si todavía no se hizo:

1. Leé `.autoflow/recordings/{numero}-session.json`.
2. Marcá `"activa": false` y agregá `"fechaFin": "<iso-ahora>"`. Guardá.

## 2. Parsear la grabación

Ejecutá con `runCommands`:
```
node .autoflow/scripts/parse-codegen-output.js {numero}
```

El script produce `.autoflow/recordings/{numero}-parsed.json` con la lista ordenada de **nodos crudos** (sin page asignada todavía). Cada nodo tiene la forma:

```json
{
  "indice": 1,
  "accion": "fill",                      // goto | fill | click | press | check | uncheck | selectOption | hover | dragTo | assert
  "selector": "getByLabel:Usuario",      // firma normalizada
  "selectorRaw": "getByLabel('Usuario')",
  "valor": "qa.test",                    // solo en fill/press/selectOption/assert/goto
  "matcher": "toBeVisible",              // solo en assert
  "etiqueta": "Usuario",
  "confiabilidad": 3                     // 1-5 (null para goto/assert). Ver pom-rules.md.
}
```

Para `assert`: si el assert es a nivel page (`expect(page).toHaveURL(...)`), `selector` vale `"page"`.

La **page** y el **id final** (`{page}::{accion}::{selector}`) se asignan en los pasos siguientes (matcheo de prefijo + agrupación manual). Llevá un puntero **"page activa"** mientras procesás el recording: arranca vacío, se actualiza cada vez que un nodo se asigna a una page (matcheo o agrupación). Los nodos `assert` con `selector="page"` heredan la page activa al momento del paso.

Si el script falla o no existe, leé directamente `.autoflow/recordings/{numero}.spec.ts` y derivá la lista a mano siguiendo el mismo shape.

## 2.5. Revisión y limpieza — borrar pasos no deseados

Antes de matchear contra Page Objects existentes, dale al QA la chance de borrar pasos que el grabador capturó pero no quiere (clicks accidentales, hovers de paso, asserts ruidosos que el grabador agregó solo, navegación intermedia que se metió por error, etc.).

1. Cargá `.autoflow/recordings/{numero}-parsed.json`. Para cada nodo armá una descripción legible:
   - `goto` → `"Paso N: 🌐 ir a {url relativizada}"`
   - `click` → `"Paso N: 👆 click en {etiqueta o selector simplificado}"`
   - `fill` → `"Paso N: ⌨️ rellenar {etiqueta} con \"{valor}\""`
   - `press` → `"Paso N: ⏎ tecla {valor}"` (los Ctrl+C/V ya fueron filtrados por el parser)
   - `check` / `uncheck` → `"Paso N: ☑️ tildar {etiqueta}"` / `"Paso N: ☐ destildar {etiqueta}"`
   - `selectOption` → `"Paso N: 📋 elegir \"{valor}\" en {etiqueta}"`
   - `hover` → `"Paso N: 🖱️ hover en {etiqueta}"`
   - `assert` → `"Paso N: ✓ verificar {matcher}{(valor opcional)} en {selector|page}"`
   
   Sumá la confiabilidad al final entre corchetes cuando aplique: `[3/5]`.

2. Abrí `vscode/askQuestions` **multi-select**: `"¿Hay pasos que quieras borrar? Tildá los que SÍ querés eliminar (dejá vacío si están todos OK)"`. Las opciones son **todos los nodos** uno por uno con la descripción del punto 1, en orden.

   > Sin opciones extra al final. Un multi-select vacío = "no borrar nada".

3. **Si no tildó nada**: continuá al paso 3 sin tocar `parsed.json`. Mensaje breve al QA: `OK, no toco nada. Sigo con el agrupamiento.` (opcional, podés omitirlo si no agrega valor).

4. **Si tildó uno o más pasos**:
   - Mostrale el resumen y pedí confirmación con `vscode/askQuestions` single-select: `"Voy a borrar {N} pasos: {lista corta}. ¿Confirmás?"`:
     - `✅ Sí, borralos`
     - `↩️ Volver atrás`
   - Si confirma:
     1. Filtrá `parsed.json.nodos` removiendo los que el QA tildó (matcheá por `indice`).
     2. **Re-numerá `indice` consecutivo** (1..M) en los nodos que quedaron. Esto es importante para que el resto del flujo (paso 4, 5, 6) tenga índices contiguos sin huecos.
     3. Reescribí `.autoflow/recordings/{numero}-parsed.json` con `nodos` limpios. **No** toques `urlsVisitadas` ni `metadata`.
     4. Mostrá al QA: `🗑️ Borré {N} pasos. Quedaron {M}. Sigo.`
   - Si elige volver atrás → reabrí el multi-select del punto 2.

5. Edge case — todos los pasos tildados: si `M === 0` después de filtrar, frená y avisá al QA: `Borraste todos los pasos. No queda nada para procesar. ¿Cancelás la grabación o volvés atrás?`. Single-select: `❌ Cancelar` / `↩️ Volver atrás`.

Después de este paso, seguí al paso 3 con el `parsed.json` ya limpio (las trazas, sidecars y todo lo que sigue trabajan sobre la lista filtrada y renumerada).

## 3. Reconocer pages existentes (prefix matching)

1. Listá los archivos `.autoflow/fingerprints/*.json`. Cada uno es el sidecar de una page existente con el shape `{ page, nodos: [id, id, ...], conecta: [...] }` (ver `.autoflow/conventions/pom-rules.md`). Cargá también `.autoflow/nodos.json` para resolver cada id a su definición.
2. Verificá que el `pages/{page}.ts` correspondiente exista; si no, ignorá ese sidecar (huérfano).
3. Para cada nodo crudo del recording, calculá su id **tentativo** asumiendo que pertenece a una page conocida: probá `{page}::{accion}::{selector}` para cada page candidata. **Resolución de deprecated**: si el id tentativo existe en `nodos.json` con `deprecated: true`, **resolvelo** siguiendo `reemplazadoPor` y trabajá con el id resuelto (live) de ahí en más. Esto cubre el caso típico: el grabador captura el selector viejo (porque el front no cambió), pero un Auto-Health Node anterior ya lo reemplazó por uno más confiable — sin esta resolución, la grabación nueva no matchearía contra la Page existente y el QA tendría que regroupar pasos que ya conocemos. Recorré los nodos del recording de izquierda a derecha (saltando los `assert` para el matcheo: el matching es solo sobre acciones del usuario) y, mientras quede prefijo sin asignar, intentá matchear el prefijo contra los `nodos[]` de cada sidecar conocido. Una page matchea si **todos** sus ids aparecen en orden al inicio del prefijo actual (igualdad exacta de id **después de resolver deprecated**, y para `fill`/`press`/`selectOption` el `valor` del recording debe coincidir con el del nodo live en `nodos.json`, donde `*` matchea cualquier valor). Si matchea, esos nodos quedan asignados a esa page existente, avanzás y actualizás el puntero de **page activa**. Si ninguna matchea, parás y todo lo que sigue queda en `-Nuevo-`.
4. Pages sin sidecar (POs viejos previos a esta convención) **no participan** del matcheo automático.

> Solo prefijo: una vez que hubo un nodo "Nuevo", todos los siguientes son nuevos también, aunque más adelante vuelvan a aparecer nodos de una page conocida. Esto es intencional para mantener el flujo predecible.

**Por cada page que matcheó**, escribí también una entrada en `.autoflow/recordings/{numero}-grupos.json` con el rango de índices del recording que cubrió esa page (`{ rangos: [{ page, desde, hasta }, ...] }`). Esto se hace acá y también en el paso 6.5 — ver detalle ahí. Si hubo asserts inmediatamente después del último nodo de una page matcheada (antes del próximo nodo de acción), atribuilos a esa misma page (page activa) y sumalos a su `sidecar.asserts[]` y a `nodos.json`.

## 4. Mostrar el listado y explicar la sintaxis

> **REGLA — pages agrupadas colapsadas, "Nuevo" siempre completo.** Cada vez que mostrés este listado (la primera vez y cada vuelta desde el paso 6 después de agrupar una page):
> - **Pages ya agrupadas** (las que ya tienen ✅, sean reusadas del prefix matching o agrupadas en iteraciones previas) → mostralas **colapsadas en una línea** con `✅ {NombrePage} (pasos {desde}–{hasta}, {N} nodos)`. NO listar los pasos internos. El QA ya tomó esa decisión, no la necesita re-leer.
> - **Pasos bajo `— Nuevo —`** → SIEMPRE completos, del primero al último de "Nuevo", sin abreviar con `…`, `...`, `[N pasos más]`, `(varios pasos)` ni ningún resumen. Es lo que el QA tiene que decidir ahora; cortar acá le rompe la decisión.
>
> Justificación: re-imprimir 50 pasos en cada vuelta hace lentas las respuestas del agente. Colapsar lo decidido y mostrar solo lo pendiente reduce drásticamente el tamaño de cada respuesta sin perder utilidad.

Mostrale al QA un mensaje con esta estructura. Las pages ya agrupadas (existentes o agrupadas en iteraciones previas) van **colapsadas en una línea**. La frontera con lo no agrupado es `— Nuevo —`. Los pasos pendientes van numerados y sin tilde — listados completos, sin abreviar.

```
Estos son los nodos que capturé. Las pages que ya existían o ya agrupamos
están colapsadas (✅). Los pasos bajo "Nuevo" son los que tenés que agrupar.
La columna [n/5] es la confiabilidad del locator (5 = id/testid, 1 = CSS frágil).

✅ LoginPage          (pasos 1–3, 3 nodos)
✅ OverviewPage       (paso 4, 1 nodo)

— Nuevo —
   Paso 5: Click en botón "Nueva inversión"       [4/5]
   Paso 6: Click en botón "Fondos Fima"           [4/5]
   Paso 7: Click en botón "Fima Premium"          [2/5]
   Paso 8: Click en botón "Suscribir"             [4/5]
   Paso 9: ✓ Verificar que "Confirmación" sea visible    (assert)

Para agrupar, escribime el rango y el nombre de la page:
  • 5-6 AccesoFima        (rango contiguo)
  • 7 ConfirmarSuscripcion (un solo paso)

Reglas:
  • Solo rangos **contiguos**. No se aceptan listas tipo 5,7.
  • Tenés que arrancar siempre por el primer paso de "Nuevo".
  • El nombre va sin sufijo "Page" — yo lo agrego.
  • Si querés cambiar algo de una page ya agrupada, escribime "rehacer"
    (te muestro los pasos internos colapsados y desagrupás).
```

Si **no quedan pasos en "Nuevo"** (todo el flujo matcheó pages existentes), saltá directo al paso 7.

## 4.5. Sugerir una agrupación

Antes de pedir input libre, **proponé una sugerencia** para el primer bloque de pasos en "Nuevo". Heurística:

1. Tomá los pasos contiguos desde el primero de "Nuevo" que parezcan pertenecer a una misma pantalla. Cortá el rango cuando:
   - aparece un `click` con verbo de navegación claro (`Continuar`, `Aceptar`, `Confirmar`, `Suscribir`, `Ingresar`) — incluí ese paso y cerrá el rango ahí.
   - hay un `assert` final del bloque — incluilo y cerrá.
   - el siguiente paso cambia de contexto (otro formulario, otro título).
   Si no hay señal clara, sugerí el rango con los próximos 1-3 pasos.
2. Inferí un nombre PascalCase a partir del paso "ancla" del bloque (el click de cierre o el título del formulario). Ej: click en `Suscribir` → `ConfirmarSuscripcion`; primer fill en `Usuario` → `Login`.
3. Validá el nombre como en el paso 5 (PascalCase, sin choques con pages existentes). Si choca, sumá un sufijo numérico (`Login2`).

Mostrale la sugerencia y abrí `vscode/askQuestions` single-select con estas opciones:
- `✅ Aceptar sugerencia: {n}-{m} {Nombre}` (o `{n} {Nombre}` si es un solo paso)
- `✏️ Agrupar manualmente`
- `↩️ Rehacer la anterior`
- `❌ Cancelar`

Si elige **Aceptar**, andá directo al paso 6 con ese rango y nombre. Si elige **Agrupar manualmente**, seguí al paso 5 esperando el comando libre. Las otras dos se manejan como en el paso 5.

## 5. Recibir el comando de agrupación

Solo se entra acá si el QA eligió `✏️ Agrupar manualmente` en el paso 4.5. Esperá texto libre con uno de estos formatos:

- `<n> <Nombre>` → agrupa solo el paso `n`. Ej: `7 ConfirmarSuscripcion`.
- `<n>-<m> <Nombre>` → agrupa el rango `[n, m]` contiguo. Ej: `5-6 AccesoFima`.
- `rehacer` → desarmá la última page agrupada en esta sesión (no las pages existentes que vinieron del matcheo) y volvé al paso 4.
- `cancelar` → confirmá con `vscode/askQuestions` y, si confirma, borrá `.autoflow/recordings/{numero}-*` y `{specPath}`, y volvé al menú.

### Validaciones

Antes de generar:

1. `n` debe ser exactamente el primer paso de "Nuevo". Si no, respondé corto: `"Tenés que arrancar por el paso {primero-de-nuevo}."` y volvé a esperar.
2. `m >= n` y `m` no puede pasarse del último paso del recording.
3. El nombre debe ser PascalCase válido (sin espacios, sin acentos en ASCII estricto). Si trae espacios, normalizalos a PascalCase y mostrale al QA cómo quedó antes de generar.
4. **Si el nombre choca con un Page Object existente** (`pages/{Nombre}Page.ts` ya existe), **NO lo rechaces** — caés al paso 5.5 (colisión) para decidir si reusar un método existente, agregar un método nuevo a esa Page o cambiar el nombre.

## 5.5. Colisión con Page Object existente

Solo se entra acá si el nombre del paso 5 coincide con un PO ya existente. Es una **oportunidad** (consolidar conocimiento de pantalla en un único PO), no un error.

### 5.5.1. Cargar el PO existente

1. Leé `pages/{Nombre}Page.ts` y extraé los **métodos públicos** (`async <nombre>(...)` que no sean `private`/`#`). Para cada método, anotá:
   - `nombreMetodo`
   - `firma` (parámetros)
   - `cuerpo` (líneas dentro del método, hasta el `}` de cierre)
   - `selectoresUsados` — lista ordenada de `(accion, selectorRaw)` extraídos del cuerpo. Heurística: cada línea `await this.<locator>.<accion>(...)` mapea a `(accion, selectorRaw del locator privado)`. Resolvé `selectorRaw` cruzando con la asignación del constructor (`this.<locator> = page.<selectorRaw>`).
2. Leé `.autoflow/fingerprints/{Nombre}.json` (sidecar). Tenés `nodos[]` planos.

### 5.5.2. Comparar con el rango actual

El rango que el QA quiere agrupar es una secuencia de nodos (acciones del usuario, sin asserts) con su `selectorRaw` y `accion` en `nodos.json` (vía `parsed.json`).

Para cada método existente, calculá la **similitud** = porcentaje de pasos del rango que matchean en orden contra los `selectoresUsados` del método.

- Match exacto: `(accion, selectorRaw)` idénticos.
- Match parcial: `accion` igual + `selector` normalizado igual (descontando modificadores).
- Si la secuencia del rango es **subsecuencia exacta** de los selectores del método o viceversa → **similitud alta** (≥80%).
- Si comparten al menos el **primer y último paso** + parte del medio → similitud media (50–80%).
- Si no → similitud baja (<50%, no se ofrece como opción).

### 5.5.3. Preguntar al QA qué hacer

Single-select `vscode/askQuestions`: `"⚠️ {Nombre}Page ya existe. ¿Qué hacés con este rango?"`. Opciones (en este orden):

- Por cada método con similitud ≥50%, una opción:
  - `🔁 Reusar método "{nombreMetodo}({firma})" — cubre {N}/{M} pasos del rango ({similitud}%)` 
- Después de las opciones de reuso (si las hay):
  - `🆕 Agregar método nuevo dentro de {Nombre}Page (recomendado si ningún match es exacto)`
- Siempre al final:
  - `✏️ Cambiar el nombre (no es la misma pantalla, fue casualidad)` → vuelve al paso 5 esperando otro comando.

### 5.5.4. Si elige reusar

- **NO** se crea ni se modifica `pages/{Nombre}Page.ts`. **NO** se modifica el sidecar (`nodos[]` ya tiene esos ids; no duplicar).
- Persistí el grupo en `{numero}-grupos.json` igual que en el paso 6.5 con `{ page, desde, hasta, metodoReusado: '<nombreMetodo>' }`. El campo `metodoReusado` lo usa el spec en el paso 8.b para elegir qué método llamar.
- Si entre los pasos del rango hay **asserts** que NO están en `sidecar.asserts[]`, sumalos al sidecar y a `nodos.json` (los asserts no son parte del método público; son enriquecimiento de la firma de la page).
- Si hay nodos `capturar`/`verificar` en el rango, son siempre nuevos: agregalos a `nodos.json`. El spec los va a emitir inline después de la llamada al método reusado.
- Volvé al paso 4 (mostrá el listado actualizado: la page agrupada va con ✅ colapsada).

### 5.5.5. Si elige agregar método nuevo

- **NO** se crea archivo nuevo. **EDITÁ** `pages/{Nombre}Page.ts`:
  1. Si los nodos del rango usan locators que ya están en el constructor (mismo `selectorRaw`), reusalos. NO sumes locators duplicados.
  2. Para cada locator nuevo, sumá `private readonly {nombreLocator}: Locator;` al bloque de declaraciones y la inicialización en el constructor (`selectorRaw` verbatim, ver paso 6).
  3. Sumá el método público nuevo siguiendo todas las reglas del paso 6 (verbo en infinitivo, JSDoc de una línea, `pressSequentially`, buffer si aplica, `waitForLoadState('domcontentloaded')` si dispara navegación). El método retorna `Promise<void>` siempre — no retorna otra Page.
- **EDITÁ** el sidecar `.autoflow/fingerprints/{Nombre}.json`:
  - Sumá los ids de los nodos nuevos al final de `nodos[]` (ya están en orden por el rango). Mantené los ids existentes intactos. Si un id se repite (locator reusado, misma acción), no lo dupliques.
  - Sumá los asserts nuevos a `asserts[]` sin duplicar.
- **Actualizá** `nodos.json` igual que en el paso 6.3 (nuevos ids, sin sobreescribir existentes).
- Persistí el grupo en `{numero}-grupos.json` con `{ page, desde, hasta, metodoNuevo: '<nombreMetodoCreado>' }`.
- Volvé al paso 4 con la page actualizada.

### 5.5.6. Notas

- La detección de similitud es heurística — el QA siempre tiene la última palabra. Si propones "reusar" mal, el QA elige "agregar método nuevo" y ya.
- Si el método reusado **retorna otra page**, el spec va a usar el retorno tal cual (`const overview = await login.ingresar(...)`). Si el método nuevo creado retorna otra page (porque la última acción navega), seguí la misma regla del paso 6.

## 6. Generar el PO de la nueva page

> **Si el comando entró por colisión (paso 5.5)**: NO entres acá. El paso 5.5.4/5.5.5 ya manejaron la generación (reuso o método agregado a PO existente). Volvé al paso 4.

Cuando el comando es válido **y el nombre NO chocaba con un PO existente**:

1. **Leé `.autoflow/conventions/pom-rules.md`** primero (sí, todas las veces).
2. Generá `pages/{NombrePage}.ts` (PascalCase, mismo nombre que la clase, con sufijo `Page`) siguiendo las reglas. Ej: clase `AccesoFimaPage` → archivo `pages/AccesoFimaPage.ts`. **El JSDoc de la clase queda en una línea** (descripción corta de la pantalla en español, sin listar acciones). Reglas críticas para que el test pase en primera corrida:
   - **Constructor: copiá `selectorRaw` verbatim.** Para cada nodo del rango, leé `nodos.json[<id>].selectorRaw` y pegalo tal cual en `this.<nombreLocator> = page.<selectorRaw>`. **No simplifiques** ni reconstruyas desde el `selector` normalizado, porque podés perder modificadores (`.first()`, `.nth(N)`, `.filter(...)`, chains de `.locator(...)`, `.contentFrame()`) y apuntar a otro elemento.
   - **Método público: ejecutá todos los nodos del rango en orden, sin saltearte ninguno.** Codegen suele emitir `click` antes de cada `fill` (focus + máscara + validación que el front escucha). Si el rango tiene `click(usuario) + fill(usuario) + click(password) + fill(password) + click(Ingresar)`, el método tiene esos 5 pasos, no solo los 3 "lógicos".
   - **`fill` se traduce siempre a `pressSequentially`** (ver `pom-rules.md` → "Fidelidad al recording"). El nodo en `nodos.json` lleva `accion: "fill"` (lógico), pero en el código del PO emitís `await this.<locator>.pressSequentially(valor)`. Sin excepciones — los campos del banco tienen máscaras y validators que rompen con `fill`.
   - **Buffer de tiempo (anti-solape)**: leé `session.bufferTiempo`. Si es `true`, **después de cada `pressSequentially(...)`** dentro del método, agregá:
     ```typescript
     // Wait: buffer anti-solape de validación on-input (configurado al crear el Test).
     await this.page.waitForTimeout(500);
     ```
     Eso cubre los dos casos que motivan el buffer: input seguido de otro input, e input seguido de un botón de avanzar/continuar/siguiente. **No** repliques el wait si ya hay un `waitForLoadState` consecutivo (sería redundante). Si `session.bufferTiempo` es `false` o falta el campo, no agregues nada.
   - **Métodos retornan siempre `Promise<void>`**. Sin chains. Los Page Objects no se conocen entre sí — `LoginPage` no importa `OverviewPage`. Si el método dispara una navegación a otra page, terminá con `await this.page.waitForLoadState('domcontentloaded')` **antes de retornar** (no instancies la próxima page; el spec se encarga). **Default `'domcontentloaded'`** (ver pom-rules.md → "Esperas"): `'networkidle'` cuelga 60s en sites con long-polling o analytics persistente, así que solo usalo en SPAs limpias y con comentario justificando.
   - **Si el primer nodo del rango es `goto`**, **no lo metas en un método del PO**. El `goto` lo dispara el spec en su propio `test.step('Abrir el canal', async () => page.goto(urlInicial))`. El nodo `goto` queda registrado en `sidecar.nodos[]` igual (es parte de la firma de la page para el matcheo), pero sin código en la clase. Los demás nodos del rango sí tienen métodos.
3. **Materializá los nodos del rango**:
   - Para cada nodo crudo del rango asignado a esta page, calculá su `id = {NombrePage}::{accion}::{selector}`.
   - Para `fill`/`press`/`selectOption`, si el `valor` parece dato variable (input del usuario, no UI fija), reemplazalo por `*` antes de armar el nodo a guardar.
   - Actualizá `.autoflow/nodos.json` (creá el archivo si no existe). Por cada id: si no está, agregalo con `{ id, page, accion, selector, selectorRaw, valor?, confiabilidad, matcher? }`. Si ya está, dejalo como está (no sobreescribir).
   - **Asserts** del rango: también van a `nodos.json` con su id. Si el assert es a nivel page (`selector="page"`), su id usa la **page activa** al momento del paso → en este rango, la page que estás generando.
   - **Ids únicos**: el id es determinístico (`{page}::{accion}::{selector}`). Si dos nodos del recording producen el mismo id es porque el selector normalizado los colapsa — eso es intencional (es la misma acción). **Nunca uses sufijos `_1`/`_2`** para desambiguar; si te pasa, frená y avisá: probablemente hay un bug en el normalizador del parser.
4. Generá el sidecar `.autoflow/fingerprints/{NombrePage}.json` con el shape `{ page, nodos: [...], asserts: [...], conecta: [...] }` documentado en `pom-rules.md`:
   - `nodos[]`: ids de **acciones del usuario** del rango (no asserts), en orden. Si el id se repite consecutivamente (mismo nodo dos veces seguidas), incluilo una sola vez.
   - `asserts[]`: ids de los `assert` del rango, en orden. **No participan del matcheo de prefijo**.
   - `conecta[]`: vacío por ahora — se completa en el paso 6.5.
   - Si el sidecar ya existía (page reusada por matcheo), enriquecelo: sumá ids nuevos a `asserts[]` sin duplicar; `nodos[]` se respeta tal cual estaba (el matcheo confirmó que el flujo es el mismo).
5. **Persistí el grupo** en `.autoflow/recordings/{numero}-grupos.json` (creá el archivo si no existe; appendeá al array `rangos`):
   ```json
   { "rangos": [{ "page": "LoginPage", "desde": 1, "hasta": 7 }, { "page": "AccesoFima", "desde": 8, "hasta": 10 }] }
   ```
   Esto persiste qué nodos del recording quedaron asignados a qué page, y lo usa el script `generar-traza.js` al cierre. **No se lo muestres al QA.**
6. **Asserts**: si entre los pasos del rango hay alguno tipo `assert`, mapealos dentro del PO. Si el assert es sobre un locator que ya está como `private readonly`, sumá un método `verificar{Algo}()` que haga `await expect(this.<locator>).<matcher>(...)`. Si el locator solo aparece en el assert, declaralo igual como `private readonly` y usalo desde el método de verificación. Asserts a nivel `page` (`toHaveURL`, `toHaveTitle`) van también dentro de un método `verificar{Algo}()` usando `this.page`.
7. Inferí el método público a partir de la cadena de acciones del usuario:
   - `fill` + `fill` + `click(verbo)` → método con verbo y parámetros para los fills (ej: `ingresar(usuario, password)`). En el cuerpo del método, los `fill` se emiten como `pressSequentially`.
   - `click` aislado con texto descriptivo → método con verbo (`abrirNuevaInversion()`).
   - Si no hay nombre claro, usá `realizarPaso{N}()` y dejá un comentario `// FIXME: renombrar al integrar.`.
8. Si la última acción navega a otra pantalla, el método igual retorna `Promise<void>` — el spec se encarga de instanciar la próxima page. NO importes la próxima page en este PO.
9. Volvé al paso 4 y mostrá el listado actualizado: la page recién creada va con ✅ y sus pasos también. **Reimprimí el listado entero** — todos los pasos del recording, del primero al último, sin abreviar (regla del paso 4).

> Cada agrupación es una iteración. Nunca generes más de una page por turno: agrupás → generás → mostrás de nuevo → esperás el próximo comando.

## 6.5. Enriquecer el grafo de conexiones

Después de cualquier iteración del paso 6 (sea page nueva o no), revisá la **secuencia de pages** del recording (incluyendo las existentes que matchearon en el prefix matching). Ej: el flujo grabado fue `LoginPage → CelularesPage → CarritoPage`.

Para cada par contiguo `A → B` en esa secuencia:

1. Leé `.autoflow/fingerprints/{A}.json`.
2. Si `B` no está en `A.conecta`, sumalo (sin duplicar).
3. Guardá el JSON.

Esto va construyendo un grafo dirigido de pages que después se usa para visualizaciones y para arrancar grabaciones desde estados intermedios. Hacelo **callado**: no le anuncies al QA que actualizaste el grafo a menos que se lo agregues a una page que ya tenía conexiones (en ese caso, una línea: `Sumé {B} a las conexiones de {A}.`).

> **Nota sobre regeneración de los grafos Mermaid**: NO los regeneres acá — la regeneración (`grafo.js` + `grafo-nodos.js`) es **costosa** (lee todos los sidecars, render Mermaid, escribe HTML autocontenido) y se difiere a un único pase al final de la sesión (paso 9.5). Acá solo enriquecés `conecta` en los sidecars; los HTML se reescriben una sola vez después del último flujo de agrupación.

## 7. Elegir / crear Test Set

Cuando ya no hay pasos en "Nuevo", **antes** de generar el spec, hay que asociar el **Test** a un **Test Set**. Nunca lo dejes suelto.

1. Listá los archivos en `.autoflow/testsets/*.json`.
2. Abrí `vscode/askQuestions` single-select: `"¿En qué **Test Set** va este **Test**?"` con:
   - cada **Test Set** existente como opción (mostrá `{nombre} [testSetId:{id}]`)
   - `➕ Crear nuevo **Test Set**` al final
3. **Si elige uno existente**: anotá su `slug` e `id`.
4. **Si elige crear nuevo**: usá `vscode/askQuestions` con tres inputs en una sola llamada (carousel):
   1. `"¿Cómo se llama el **Test Set**?"` → text input (ej: `Dolar MEP`)
   2. `"Test Set ID"` → text input (ej: `12345`)
   3. `"Descripción corta"` → text input

   Generá `slug` desde `nombre` en **camelCase**: sin acentos, primera palabra minúscula, resto capitalizado, sin separadores. Ej: `Dolar MEP` → `dolarMep`, `Regresion de compras` → `regresionDeCompras`. Si `.autoflow/testsets/{slug}.json` ya existe, pedí otro nombre.

## 8. Cierre — generar el Test

1. Mostrá la propuesta:
   ```
   📋 **Page Objects** cubiertos:
     • LoginPage
     • OverviewPage
     • AccesoFima           (nuevo)
     • ConfirmarSuscripcion (nuevo)

   **Test Set** → "{nombre}" [testSetId:{id}]
   **Test**     → "{nombre del caso}" [testId:{numero}]
   Archivo  → tests/{slug}-{id}.spec.ts
   ```
2. Abrí `vscode/askQuestions` single-select: `"¿Confirmás que agregue el **Test** al **Test Set**?"`:
   - `✅ Sí, generarlo`
   - `✏️ Rehacer alguna **Page Object**` → volvé al paso 4 con la opción `rehacer`
3. Si confirma:
   - El path del spec es **siempre** `tests/{slug}-{id}.spec.ts` (uno por **Test Set**, no por **Test**).

   ### 8.a. Generar / actualizar `data/data-{slug}.ts` — OBLIGATORIO ANTES DE ESCRIBIR EL SPEC

   **Aplica siempre, sin excepciones, tanto si el Test Set es nuevo como existente.** Los specs **nunca** llevan literales de input. Cada **Test Set** tiene un único archivo `data/data-{slug}.ts` **autocontenido**: define una `interface Data{PascalSlug}` con todos los campos que usa, y exporta `data{PascalSlug}: Data{PascalSlug}` con los valores. **No hay catálogo central de usuarios** — los usuarios viven dentro del data file de su **Test Set**.

   Pasos, en este orden:

   **(1) Identificar y separar los literales del recording**
   - Recorré los argumentos de `fill`, `press`, `selectOption`. Ignorá los strings de UI fija (títulos, labels, nombres de botones) — esos viven en locators del PO.
   - Clasificá cada literal en dos baldes:
     - **Usuarios**: usuario, contraseña, DNI. (En el flujo típico viene de los primeros `fill` del login.) Sumá `canal` del caso (lo tenés en `session.json`). Si el flujo usa más de un usuario (ej: comprador + vendedor), asigná un nombre distinto a cada uno (`usuarioPrincipal`, `usuarioVendedor`, etc.).
     - **Datos del test**: importes, búsquedas, productos, cuentas destino, fechas, todo lo demás.

   **(2) Crear / actualizar `data/data-{slug}.ts` (autocontenido)**
   - Naming: `data-{slug}.ts` donde `{slug}` es el slug del **Test Set** en camelCase.
   - Importá `User` desde `./types` (ya existe; expone `interface User { canal; user; pass; dni? }`).
   - Definí una `interface Data{PascalSlug}` que liste **todos** los campos del data file: `urlInicial`, los usuarios (cada uno como `User`), los datos del test (con sus tipos concretos: `number`, `string`, etc.).
   - Exportá `data{PascalSlug}: Data{PascalSlug}` con los valores. **No uses `as const`** — la interface ya da el contrato.
   - Si el archivo **ya existe** (caso nuevo en un **Test Set** existente): enriquecé la `interface` agregando los campos nuevos que necesite este caso, y sumá los valores correspondientes en el objeto `data{PascalSlug}`. **No rompas keys** que ya estaban en uso.
   - **Reuso de usuario**: si el mismo `user`+`canal` ya está como propiedad del data file, reusalo (apuntá la nueva variable a la misma constante intermedia o duplicá los datos sólo si conceptualmente son escenarios distintos). En la duda, pedile al QA por `vscode/askQuestions` text input cómo describiría este usuario (sugerencia por default: `usuarioPrincipal`).
   - **Importante**: el password en homologación queda en texto plano en el repo. Confirmá con el QA que el usuario es de homologación antes de commitearlo.
   - **`urlInicial` siempre presente**: copiá la URL exacta del campo `urlInicial` de `.autoflow/recordings/{numero}-session.json`.
   - **Números planos**: si el recording capturó `'100.000'` o `'1,000'`, guardalo como `number` plano (`100000`). Si el form exige el separador, formatealo en el método del PO, no en el data file.

   **Template del data file**:

   ```typescript
   import type { User } from './types';

   export interface DataDolarMep {
     urlInicial: string;
     usuarioPrincipal: User;
     importeOperacion: number;
     cuentaOrigen: string;
   }

   export const dataDolarMep: DataDolarMep = {
     urlInicial: 'https://...',
     usuarioPrincipal: {
       canal: 'ICBC PROD',
       user: 'qa.estandar',
       pass: 'Qa12345!',
       dni: '12345678',
     },
     importeOperacion: 100000,
     cuentaOrigen: '0290011200000000123456',
   };
   ```

   **(3) Re-exportar desde `data/index.ts`**
   - Sumá `export * from './data-{slug}';` si todavía no está.

   **Checklist pre-escritura** (mental, no se lo muestres al QA): antes de llamar a `edit` para escribir el spec, releé el bloque que vas a escribir y confirmá que NO contiene comillas con datos de input — solo destructurings desde `data{PascalSlug}`. Si encontrás un literal ahí, frená y volvé al paso 8.a.2.

   ### 8.b. Escribir el spec — `test.describe` + `test.step`

   **Template obligatorio del archivo `tests/{slug}-{id}.spec.ts`**. Cada **Test Set** = un `test.describe` que envuelve a todos los **Tests** del set. Cada **Test** dentro = un `test('...', ...)` con sus pasos en `test.step`.

   **Formato exacto de los nombres** (no improvisar — el formato es contrato del repo):
   - Describe: `"{nombreTestSet} [testSetId:{idTestSet}]"` — ej: `"Dolar MEP [testSetId:12345]"`.
   - Test: `"{nombreCaso} [testId:{numero}]"` — ej: `"Compra de dolar mep con CA [testId:43213]"`.
   - **No hay prefijo `TC-`** ni `TC-{numero}` antes del nombre. El id va al final entre corchetes.

   **`test.step`**:
   - Cada acción lógica del **Test** (instanciar una page, ejecutar un método de PO, hacer un assert) va envuelta en `await test.step('comentario corto y concreto', async () => { ... })`.
   - El comentario describe **qué hace el paso** desde la perspectiva del usuario (ej: `'Loguearse y entrar al overview'`, `'Suscribir al fondo Fima Premium'`). No describir tipos ni clases.
   - Si el step produce una page nueva, **retornala** del callback y asignala a una `const`: `const overview = await test.step('...', async () => login.ingresar(...));`.
   - El `await page.goto(urlInicial)` también va en su propio step (`'Abrir el canal'` o similar).

   **Si la sesión tiene `authState`** (caso arrancó logueado), agregá **dentro del `describe`** la línea:
   ```typescript
   test.use({ storageState: '{authState}' });
   ```
   y omití el step de login (el `urlInicial` ya es post-login).

   **Template completo (Test Set nuevo, primer Test del set)**:

   ```typescript
   import { test, expect } from '../fixtures';
   import { dataDolarMep } from '../data';
   import LoginPage from '../pages/LoginPage';
   import OverviewPage from '../pages/OverviewPage';
   import AccesoFimaPage from '../pages/AccesoFimaPage';

   test.describe('Dolar MEP [testSetId:12345]', () => {
     test('Compra de dolar mep con CA [testId:43213]', async ({ page }) => {
       const { urlInicial, usuarioPrincipal, importeOperacion } = dataDolarMep;

       // Instancias de Page Objects — todas arriba, una por línea, prolijas.
       const loginPage = new LoginPage(page);
       const overviewPage = new OverviewPage(page);
       const accesoFimaPage = new AccesoFimaPage(page);

       await test.step('Abrir el canal', async () => {
         await page.goto(urlInicial);
       });

       await test.step('Loguearse y entrar al overview', async () => {
         await loginPage.ingresar(usuarioPrincipal.user, usuarioPrincipal.pass);
       });

       await test.step('Abrir Inversiones → Fondos Fima', async () => {
         await overviewPage.abrirInversiones();
       });

       await test.step('Suscribir al Fima Premium', async () => {
         await accesoFimaPage.suscribir(importeOperacion);
       });
     });
   });
   ```

   Reglas concretas:
   - **Resolución del método a llamar por cada grupo de `grupos.json`**:
     - Si el grupo tiene `metodoReusado: '<nombre>'` (vino de paso 5.5.4) → usar ese método del PO existente, **sin** generar nuevos.
     - Si el grupo tiene `metodoNuevo: '<nombre>'` (vino de paso 5.5.5) → llamar al método recién agregado a la Page existente.
     - Si el grupo no tiene ninguno de los dos → es un PO nuevo (paso 6 normal); usar el método inferido por el paso 6.7 de la generación.
   - **Imports fijos al tope**: `import { test, expect } from '../fixtures';` + `import { data{PascalSlug} } from '../data';` + un `import` por cada PO usado en el Test (incluí los Page Objects existentes que se reusaron por colisión).
   - **Un solo `test.describe` por archivo**, con el formato exacto del nombre.
   - **Destructurá `data{PascalSlug}`** al inicio del `test()`. Pasá los campos primitivos a los métodos del PO (`usuarioPrincipal.user`, `usuarioPrincipal.pass`), no el objeto `User` entero.
   - **Bloque de instancias arriba**: después del destructuring de data, declarar **todas** las instancias de Page Objects que el Test usa, una por línea, sin separación con líneas en blanco — bloque visualmente prolijo. Naming: `LoginPage` → `loginPage`, `AccesoFimaPage` → `accesoFimaPage` (clase en camelCase con primera letra minúscula). Aunque una page se use en un solo step, igual va arriba con las demás.
   - **Sin chains**: los métodos del PO retornan `Promise<void>`. No retornan otra page. Cada `test.step` llama al método con `await {paginaCamelCase}.{metodo}(args)`, **sin** asignar a una `const`. La transición entre pages vive solo en el sidecar `conecta[]` del fingerprint, no en el código TS.
   - **Asserts opcionales**: si la próxima page tiene un método `estaVisible()`, llamalo en su propio step (`'Verificar que cargó el overview'`). Si no lo tiene, no inventes asserts genéricos.

   **Si el Test Set es nuevo** (el archivo spec no existe):
   - Creá `tests/{slug}-{id}.spec.ts` con el `test.describe('{nombreSet} [testSetId:{idSet}]', () => { ... })` y adentro el primer `test('{nombreCaso} [testId:{numero}]', ...)`.
   - Creá `.autoflow/testsets/{slug}.json` siguiendo el shape de `crear-test-set.md` paso 3 — **`specPath` a nivel raíz** del JSON (no dentro de `casos[]`). Los `casos[]` solo llevan `{ numero, nombre }`. El `specPath` raíz es lo que `dashboard.js`, `run-testset.js` y `validar-coherencia.js` leen — si lo metés dentro de `casos[]` el dashboard no encuentra el spec y los Tests aparecen vacíos en la grilla.

   **Si el Test Set es existente** (el archivo spec ya existe):
   - **No crees un archivo nuevo y no toques el `test.describe`** — ya existe con su `[testSetId:...]`.
   - Insertá el nuevo `test('{nombreCaso} [testId:{numero}]', ...)` **dentro** del `test.describe` existente, al final (antes del `})` de cierre del describe). Reusá los imports que ya estén; sumá los nuevos `import` de POs si este caso usa pages que el archivo todavía no tenía.
   - El JSON del **Test Set** ya tiene el path en `casos`; no hace falta tocarlo.

   Si hace falta, agregá fixtures a `fixtures/index.ts` (pero **datos no van en fixtures**, van en `data/`).

## 9. Generar la traza del recording — OBLIGATORIO

**Inmediatamente después de escribir el spec** (paso 8.b) y **antes** del resumen final, generá la traza ejecutando con `runCommands`:

```
node .autoflow/scripts/generar-traza.js {numero}
```

El script lee `.autoflow/recordings/{numero}-parsed.json` + `.autoflow/recordings/{numero}-grupos.json` + `.autoflow/nodos.json` y emite `.autoflow/recordings/{numero}-path.json` con la secuencia de ids de nodo visitados (incluyendo asserts) en el orden del recording.

**Verificación obligatoria**: después de correr el script, **leé `.autoflow/recordings/{numero}-path.json` con la herramienta `read`** para confirmar que existe y que tiene `path[]` no vacío. Si no existe o está vacío, **el flujo se considera incompleto** — sin traza, el dashboard no muestra los pasos del Test, exportar a ALM falla, cobertura no cuenta el Test, y Auto-Health Node no puede operar sobre ese caso.

**Si el script falla o el archivo no se generó**:
1. **NO avances** al resumen ni al paso 10 de limpieza — los inputs `parsed.json`/`grupos.json` siguen siendo necesarios para reintentar.
2. Mostrale al QA el error concreto del stderr (típicamente: falta `grupos.json`, algún nodo no cae en ningún rango, id no existe en `nodos.json`).
3. Abrí `vscode/askQuestions` single-select: `"La traza no se generó. ¿Qué hacés?"`:
   - `🔄 Reintentar generar-traza` → volvé a correr el script.
   - `📋 Ver inputs` → ejecutá `dir .autoflow/recordings/{numero}-*` (Windows) o `ls -la .autoflow/recordings/{numero}-*` (Linux/Mac) con `runCommands` y mostrale al QA qué archivos existen.
   - `↩️ Volver al menú sin limpiar` → marcá `session.activa: false` pero **NO** borres temporales. El QA puede regenerar después con `node .autoflow/scripts/generar-traza.js {numero}` a mano cuando arregle el problema.

## 9.5. Regenerar los grafos (una sola vez por sesión)

Acá, después de que se generaron y enriquecieron todos los sidecars (`conecta`), regenerá los dos diagramas Mermaid ejecutando con `runCommands`:

```
node .autoflow/scripts/grafo.js
node .autoflow/scripts/grafo-nodos.js
```

Eso reescribe `.autoflow/grafos/grafo.{md,html}` (grafo de pages) y `.autoflow/grafos/grafo-nodos.{md,html}` (grafo de nodos coloreado por confiabilidad). Una sola corrida por sesión, no después de cada agrupación. Si alguno de los scripts falla (por ejemplo, todavía no hay fingerprints), seguí adelante igual — no es bloqueante. Callado salvo error.

> Esto reemplaza la regeneración per-iteration que había antes en el paso 6.5. La motivación: cada `grafo.js` lee todos los sidecars + render Mermaid + escribe HTML autocontenido; multiplicado por N agrupaciones eran 5–20 segundos de overhead por sesión.

## 10. Limpieza

Una vez que `path.json` existe (verificá su existencia antes de borrar nada), borrá los archivos temporales:
- `.autoflow/recordings/{numero}-parsed.json`
- `.autoflow/recordings/{numero}.spec.ts`

**Mantené** como historial:
- `.autoflow/recordings/{numero}-session.json` (con `activa: false`)
- `.autoflow/recordings/{numero}-path.json` (traza de nodos)
- `.autoflow/recordings/{numero}-grupos.json` — **NO lo borres**. `validar-trazas.js` lo necesita para regenerar la traza si después se pierde el `path.json` (git pull, clearSession parcial, etc.). Pesa ~1 KB, no contamina nada visible.

## Bloque AÑADIR PASOS — pasos nuevos al final de un Test existente

Solo se entra acá si `session.modo === "append"` (flag interno; visible al QA como **"Añadir pasos al final del Test"**). La sesión ya trae:
- `numero` del **Test** original (testId)
- `specPath` del spec ya existente (`tests/{slug}-{id}.spec.ts`)
- `testNombre` — el nombre del `test('...')` que se va a extender (formato `"{nombre} [testId:{numero}]"`)

### A.1. Cerrar la sesión y parsear

Igual al paso 1 (marcar `activa: false`, `fechaFin`) y al paso 2 (correr `parse-codegen-output.js {numero}` para tener `parsed.json`).

### A.2. Matchear contra Page Objects existentes

Igual al paso 3 (prefix matching contra `.autoflow/fingerprints/*.json`). En este modo esperamos que **TODOS** los nodos matcheen con **Page Objects** conocidos — el QA está extendiendo un flujo, no creando pantallas nuevas.

Si quedan pasos en "Nuevo" sin matchear:
- Mostralos al QA y abrí `vscode/askQuestions` single-select:
  - `🆕 Agruparlos como **Page Objects** nuevos (caemos al flujo normal del paso 4)` — si el QA confirma, salí del bloque AÑADIR PASOS y seguí desde el paso 4 normal.
  - `↩️ Cancelar (no toco nada)` — borrá los archivos temporales y volvé al menú.

### A.3. Confirmar con el QA

Mostrá el listado de los pasos nuevos asignados a sus **Page Objects** existentes, formato similar al paso 4, y confirmá:

```
Voy a añadir al final del **Test** [testId:{numero}] estos pasos:

✅ AccesoFima
   ✅ Paso 1: Click en botón "Fondos Fima"           [4/5]
   ✅ Paso 2: Click en botón "Fima Premium"          [2/5]

✅ ConfirmarSuscripcion
   ✅ Paso 3: Click en botón "Suscribir"             [4/5]
```

`vscode/askQuestions` single-select: `"¿Confirmás añadir los pasos?"`:
- `✅ Sí, añadirlos`
- `❌ Cancelar`

### A.4. Editar el spec (sin regenerar)

1. Leé `tests/{slug}-{id}.spec.ts`.
2. Localizá el bloque `test('{testNombre}', ...)` exacto **dentro del `test.describe`**. El nombre tiene formato `"{nombre} [testId:{numero}]"`. Si no aparece, frená y avisá al QA.
3. Identificá el **bloque de instancias** del Test (al inicio del `test()`, después del destructuring de data): `const loginPage = new LoginPage(page); const overviewPage = new OverviewPage(page); ...`. Es la lista visual de las pages que el Test usa.
4. Para cada page del añadido:
   - Si la page **ya está** en el bloque de instancias (porque ya se usaba en el Test), reusá esa variable. No agregues una nueva instancia.
   - Si la page es **nueva** para este Test (primera vez que aparece tras añadir pasos), agregá una línea más al bloque de instancias respetando el orden y la prolijidad (ej: `const transferenciasPage = new TransferenciasPage(page);`).
5. Para cada paso del añadido, envolvelo en su propio `test.step('comentario corto', async () => { ... })` — mismo estilo que el resto del **Test**. El cuerpo es `await {paginaCamelCase}.{metodo}(args)`. **Reusá los nombres de método que ya existen en cada PO** — no inventes métodos nuevos. Si los pasos del recording no encajan en ningún método público existente, frená y avisá al QA: el caso requiere editar los POs, lo que cae fuera del scope de este modo.
6. Insertá los nuevos `test.step(...)` justo **antes del cierre** del bloque `test()`, después del último step.

### A.5. Sidecars y `nodos.json`

- Los nodos añadidos ya existen en `nodos.json` (son los mismos ids reusados de pages conocidas) — no se agregan ni modifican.
- Los sidecars de las pages involucradas tampoco cambian — el matcheo confirmó que el flujo de cada page es el mismo.
- Si surgió un assert nuevo (`assert` que no estaba en el sidecar.asserts[]), sí sumalo a `asserts[]` del sidecar correspondiente y a `nodos.json`.

### A.6. Traza

Generá la traza igual que en el paso 9 (`generar-traza.js {numero}`) — la nueva traza reemplaza a la vieja en `{numero}-path.json`. El añadido redefine el camino completo del **Test**, no solo lo nuevo.

### A.7. Limpieza

Borrá `parsed.json`, `grupos.json` (si se creó) y el `.spec.ts` temporal de la grabación (no el spec del **Test Set**, que vive en `tests/`). Mantené `session.json` (con `modo: "append"` para historial) y `path.json`.

### A.8. Resumen

```
✅ Listo. Añadí al final del **Test** [testId:{numero}] en {specPath}:
  • {N} pasos nuevos en {pages involucradas}
```

`vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `▶️ Correrlo ahora`
- `✏️ Editar otra cosa`
- `🏠 Volver al menú`

## 11. Resumen final

```
✅ Listo. Generé:

  • pages/AccesoFimaPage.ts
  • pages/ConfirmarSuscripcionPage.ts
  • tests/dolarMep-12345.spec.ts

Reusé:
  • pages/LoginPage.ts
  • pages/OverviewPage.ts

**Test Set**: "{nombre}" [testSetId:{id}] {nuevo|actualizado}.
**Test**:     "{nombre}" [testId:{numero}]
```

Abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `▶️ Correrlo ahora` → dispará la VSCode task **`autoflow:run-test-headed`** con el path del spec del **Test Set**. Corre con navegador visible (`--headed --workers=1`) para que el QA vea la prueba que acabamos de grabar ejecutándose en pantalla.
- `🏠 Volver al menú`
