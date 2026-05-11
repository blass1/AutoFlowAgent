---
mode: agent
description: Después de cerrar el navegador de grabación, muestra los pasos capturados y los agrupa interactivamente con el QA en Page Objects, reconociendo pages que ya existen.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Generar Page Objects (agrupación interactiva)

Se carga cuando vuelve el control después de la grabación (la task `autoflow:start-recording` retornó porque el QA cerró el navegador).

## 0. ¿Modo añadir pasos?

Leé `.autoflow/recordings/{numero}-session.json`. Si tiene `"modo": "append"` (flag interno del flujo de **añadir pasos al final del Test**), **saltás todo el flujo normal** y delegás en `pom-append-grabado.md`: ese sub-prompt mergea los pasos al spec existente reusando locators y métodos de pages ya conocidas, sin generar Page Objects ni Test Sets nuevos.

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

La **page** y el **id final** (`{page}::{accion}::{selector}`) se asignan en los pasos siguientes (matcheo automático contra el vocabulario + agrupación manual). Llevá un puntero **"page activa"** mientras procesás el recording: arranca vacío, se actualiza cada vez que un nodo se asigna a una page (matcheo o agrupación). Los nodos `assert` con `selector="page"` heredan la page activa al momento del paso.

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

## 3. Reconocer pages existentes (matcheo por vocabulario)

1. Listá los archivos `.autoflow/fingerprints/*.json`. Cada uno es el sidecar de una page existente con el shape `{ page, nodos: [id, ...], asserts: [id, ...], conecta: [...] }`. Cargá también `.autoflow/nodos.json` para resolver cada id a su definición.
2. Verificá que el `pages/{page}.ts` correspondiente exista; si no, ignorá ese sidecar (huérfano).
3. **Para cada nodo de acción del recording** (en orden de izquierda a derecha, saltando los `assert` — esos los atribuís en el paso 5):
   - **a.** Calculá el id tentativo `{page}::{accion}::{selector}` para cada page candidata (las que tienen sidecar válido).
   - **b. Resolución de deprecated**: si el id tentativo existe en `nodos.json` con `deprecated: true`, resolvelo siguiendo `reemplazadoPor` y trabajá con el id live de ahí en más. Cubre el caso del grabador capturando el selector viejo después de que Auto-Health Node lo saneó.
   - **c. Matcheo**: el nodo del recording matchea con un sidecar si el id resuelto está en `sidecar.nodos[]`. Para `fill`/`press`/`selectOption`, el `valor` del nodo live en `nodos.json` debe coincidir con el del recording (`*` matchea cualquier valor).
   - **d. Resolución de ambigüedad**: si el id matchea en más de un sidecar (raro pero posible si dos pages comparten un control idéntico), preferí la **page activa actual** (continuidad del flujo). Si la page activa no es candidata o es `null`, tomá el primer match en orden alfabético de page.
   - **e.** Si matchea: el paso queda asignado a esa page existente y la **page activa** se actualiza. Si no matchea: el paso queda como `-Nuevo-` y la page activa **no cambia** (sigue siendo la última asignada — relevante para atribuir asserts intermedios).
4. Pages sin sidecar (POs viejos previos a esta convención) **no participan** del matcheo automático.

> ### 🔑 El matcheo es por **vocabulario**, no por secuencia ni por prefijo
>
> Cualquier paso del recording puede matchear cualquier sidecar conocido en cualquier momento del flujo, sin importar el orden en que aparecen los nodos en `sidecar.nodos[]`. El sidecar funciona como **vocabulario** (set de ids posibles en esa page), no como secuencia de un flujo único.
>
> Esto permite que un mismo Test reuse pages cuya secuencia varía entre flujos. Ejemplos:
> - "Compra Samsung" y "Compra Sony" reusan HomePage/LoginPage/CartPage/CheckoutPage al 100% aunque diverjan en el click de producto.
> - "Login + Logout" reusa HomePage + LoginPage del flujo de compra aunque después diverja totalmente.
>
> Versiones anteriores del agente exigían "todos los ids del sidecar deben aparecer en orden al inicio del prefijo del recording", lo que producía 0% de reuso entre flujos parecidos. Esa restricción ya no aplica.

**Por cada page que matcheó al menos un nodo**, escribí entradas en `.autoflow/recordings/{numero}-grupos.json` con el shape `{ rangos: [{ page, desde, hasta }, ...] }`. Como ya no se exige rangos contiguos por page, **podés tener múltiples rangos para la misma page** en el mismo Test (ej: el QA navega Home → Login → vuelve a Home). Cada rango es un bloque de pasos consecutivos asignados a la misma page; se cierra cuando aparece un paso que cae en otra page o en "Nuevo".

**Ejemplo de rangos generados** para un recording `[goto, click(login), fill(user), fill(pass), click(submit), click(producto), click(addToCart), click(cart)]`:
```json
{ "rangos": [
  { "page": "HomePage",   "desde": 1, "hasta": 2 },
  { "page": "LoginPage",  "desde": 3, "hasta": 5 },
  { "page": "HomePage",   "desde": 6, "hasta": 6 },
  { "page": "ProductPage","desde": 7, "hasta": 8 }
]}
```

**Asserts**: si un assert del recording aparece intercalado, atribuilo a la **page activa** al momento del paso (la última page que tuvo un nodo asignado). Si todavía no hay page activa (assert al inicio del recording sin nodo de acción previo), queda pendiente hasta que se asigne el primer nodo y se atribuye a esa primera page. Sumá el id del assert a `sidecar.asserts[]` de la page atribuida (sin duplicar) y a `nodos.json`.

## 4. Mostrar el listado y explicar la sintaxis

> **REGLA — pages agrupadas colapsadas, "Nuevo" siempre completo.** Cada vez que mostrés este listado (la primera vez y cada vuelta desde el paso 6 después de agrupar una page):
> - **Pages ya agrupadas** (las que ya tienen ✅, sean reusadas del matcheo automático o agrupadas en iteraciones previas) → mostralas **colapsadas en una línea** con `✅ {NombrePage} (pasos {desde}–{hasta}, {N} nodos)`. Si la misma page tuvo varios rangos no contiguos, mostrá una línea por rango. NO listar los pasos internos.
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

Si el nombre del paso 5 coincide con un PO ya existente (`pages/{Nombre}Page.ts`), **delegá en `pom-colision.md`**: ese sub-prompt carga los métodos públicos del PO existente, calcula similitud contra el rango actual y le ofrece al QA reusar un método, agregar un método nuevo a esa Page o cambiar el nombre.

Cuando vuelve, persistió `metodoReusado` o `metodoNuevo` en `{numero}-grupos.json` (el paso 8.b lee ese campo) y enriqueció sidecar + `nodos.json` si correspondía. Volvé al paso 4 con el listado actualizado.

## 6. Generar el PO de la nueva page

> **Si el comando entró por colisión (paso 5.5)**: NO entres acá. El paso 5.5.4/5.5.5 ya manejaron la generación (reuso o método agregado a PO existente). Volvé al paso 4.

Cuando el comando es válido **y el nombre NO chocaba con un PO existente**:

1. **Leé `.autoflow/conventions/pom-rules.md`** primero (sí, todas las veces).
2. Generá `pages/{NombrePage}.ts` (PascalCase, mismo nombre que la clase, con sufijo `Page`) siguiendo las reglas. Ej: clase `AccesoFimaPage` → archivo `pages/AccesoFimaPage.ts`. **El JSDoc de la clase queda en una línea** (descripción corta de la pantalla en español, sin listar acciones). Reglas críticas para que el test pase en primera corrida:
   - **Constructor: copiá `selectorRaw` verbatim.** Para cada nodo del rango, leé `nodos.json[<id>].selectorRaw` y pegalo tal cual en `this.<nombreLocator> = page.<selectorRaw>`. **No simplifiques** ni reconstruyas desde el `selector` normalizado, porque podés perder modificadores (`.first()`, `.nth(N)`, `.filter(...)`, chains de `.locator(...)`, `.contentFrame()`) y apuntar a otro elemento.
   - **Método público: ejecutá todos los nodos del rango en orden, sin saltearte ninguno.** Codegen suele emitir `click` antes de cada `fill` (focus + máscara + validación que el front escucha). Si el rango tiene `click(usuario) + fill(usuario) + click(password) + fill(password) + click(Ingresar)`, el método tiene esos 5 pasos, no solo los 3 "lógicos".
   - **`fill` se traduce siempre a `pressSequentially`** (ver `pom-rules.md` → "Fidelidad al recording"). El nodo en `nodos.json` lleva `accion: "fill"` (lógico), pero en el código del PO emitís `await this.<locator>.pressSequentially(valor)`. Sin excepciones — los campos del banco tienen máscaras y validators que rompen con `fill`.
   - **Buffer de tiempo (anti-solape)**: leé `session.bufferTiempo`. Si es `true`, **después de cada acción de input/selección** dentro del método agregá un wait de 500ms. Las acciones que disparan el wait son: `pressSequentially`, `click`, `check`, `uncheck`, `selectOption`.
     ```typescript
     await this.page.waitForTimeout(500);
     ```
     **Sin comentario arriba** del wait — un PO con 13 acciones tendría 13 comentarios idénticos, es puro ruido visual. El patrón es reconocible solo.
     Cubre tres casos típicos: (a) input → input (validación on-input), (b) input → click de avanzar/continuar (el botón se habilita tras la validación), (c) click → click rápido en checkboxes/toggles consecutivos (sin el wait el segundo se ejecuta antes de que el front terminó de aplicar el primero y el checkbox queda mal seleccionado). **No** emitas el wait si la siguiente línea ya es `waitForLoadState(...)` (redundante) o si la acción es la última del método y el método dispara navegación (cerrás con `waitForLoadState('domcontentloaded')` en lugar). Si `session.bufferTiempo` es `false` o falta el campo, no agregues nada.
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
   - `asserts[]`: ids de los `assert` del rango, en orden. **No participan del matcheo** (son opcionales y pueden variar entre grabaciones del mismo flujo).
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

Después de cualquier iteración del paso 6 (sea page nueva o no), revisá la **secuencia de pages** del recording (incluyendo las existentes que matchearon en el paso 3 y las que aparecen varias veces como rangos no contiguos). Ej: el flujo grabado fue `LoginPage → CelularesPage → CarritoPage`. Si una page aparece dos veces (`HomePage → LoginPage → HomePage`), tomá pares contiguos como están — `HomePage → LoginPage` y `LoginPage → HomePage` son dos conexiones distintas.

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
   - Creá `.autoflow/testsets/{slug}.json` siguiendo el shape de `crear-test-set.md` paso 3.

   > ### ⚠️ REGLA CRÍTICA — `specPath` va a nivel **raíz** del testset JSON, NUNCA dentro de `casos[]`
   >
   > Es el bug más recurrente del agente. `dashboard.js`, `run-testset.js`, `validar-coherencia.js` y `exportar-alm.js` leen `set.specPath` (nivel raíz). Si lo metés dentro de `casos[]`:
   > - el dashboard no encuentra el spec y los Tests aparecen vacíos en la grilla,
   > - exportar a ALM no genera filas,
   > - correr el set falla con `specPath` null.
   >
   > **❌ INCORRECTO** — `specPath` adentro de cada caso:
   > ```json
   > {
   >   "nombre": "Dolar MEP",
   >   "slug": "dolarMep",
   >   "id": "12345",
   >   "casos": [
   >     { "numero": "43213", "nombre": "Compra con CA", "specPath": "tests/dolarMep-12345.spec.ts" }
   >   ]
   > }
   > ```
   >
   > **✅ CORRECTO** — `specPath` a nivel raíz, `casos[]` sólo con `numero` + `nombre`:
   > ```json
   > {
   >   "nombre": "Dolar MEP",
   >   "slug": "dolarMep",
   >   "id": "12345",
   >   "specPath": "tests/dolarMep-12345.spec.ts",
   >   "casos": [
   >     { "numero": "43213", "nombre": "Compra con CA" }
   >   ]
   > }
   > ```
   >
   > Antes de escribir el JSON releé el bloque y confirmá visualmente que `"specPath"` está al mismo nivel que `"slug"`, no anidado dentro de un objeto del array `casos`.

   **Si el Test Set es existente** (el archivo spec ya existe):
   - **No crees un archivo nuevo y no toques el `test.describe`** — ya existe con su `[testSetId:...]`.
   - Insertá el nuevo `test('{nombreCaso} [testId:{numero}]', ...)` **dentro** del `test.describe` existente, al final (antes del `})` de cierre del describe). Reusá los imports que ya estén; sumá los nuevos `import` de POs si este caso usa pages que el archivo todavía no tenía.
   - El JSON del **Test Set** ya tiene el path en `casos`; no hace falta tocarlo.

   Si hace falta, agregá fixtures a `fixtures/index.ts` (pero **datos no van en fixtures**, van en `data/`).

   ### 8.c. Generar la traza del recording — INDIVISIBLE de escribir el spec

   > ### ⛔ ESTE SUBPASO ES PARTE DEL PASO 8, NO ES OPCIONAL NI POSTERIOR
   >
   > Históricamente este paso vivía como "paso 9 separado" y el agente se lo salteaba al saltar al resumen. **Ahora es subpaso obligatorio del paso 8**: si escribiste el spec en 8.b, sí o sí ejecutás esto antes de cerrar 8.

   **Inmediatamente después de escribir el spec** (8.b), ejecutá con `runCommands`:

   ```
   node .autoflow/scripts/generar-traza.js {numero}
   ```

   El script lee `.autoflow/recordings/{numero}-parsed.json` + `.autoflow/recordings/{numero}-grupos.json` + `.autoflow/nodos.json` y emite `.autoflow/recordings/{numero}-path.json` con la secuencia de ids de nodo visitados (incluyendo asserts) en el orden del recording.

   **Sin esta traza**:
   - El dashboard muestra el Test pero **sin pasos** y **sin grafo**.
   - Exportar a ALM falla (la fuente de verdad del export es `path.json`).
   - Cobertura ignora el caso.
   - Auto-Health Node no puede operar sobre ese Test.

   La verificación de que el archivo se generó correctamente está en el paso 9 (gate obligatorio antes del resumen).

## 9. Verificar que la traza existe — GATE OBLIGATORIO

> ### ⛔ NO PODÉS AVANZAR AL RESUMEN SIN ESTE PASO
>
> El paso 8.c te hizo correr `generar-traza.js`. Acá confirmás que el archivo existe y es válido. **Sin este chequeo el bug vuelve**: el dashboard queda mostrando Tests sin pasos, exportar a ALM falla y cobertura ignora el caso.

**Leé `.autoflow/recordings/{numero}-path.json` con la herramienta `read`** y verificá:
- El archivo existe.
- Tiene `path[]` con al menos 1 elemento (no array vacío).

Si la verificación pasa → seguí al paso 9.5.

**Si el archivo no existe o `path[]` está vacío**:
1. **NO avances** al resumen ni al paso 10 de limpieza — los inputs `parsed.json`/`grupos.json` siguen siendo necesarios para reintentar.
2. Mostrale al QA el error concreto del stderr de la corrida del 8.c (típicamente: falta `grupos.json`, algún nodo no cae en ningún rango, id no existe en `nodos.json`).
3. Abrí `vscode/askQuestions` single-select: `"La traza no se generó. ¿Qué hacés?"`:
   - `🔄 Reintentar generar-traza` → volvé a correr `node .autoflow/scripts/generar-traza.js {numero}`.
   - `📋 Ver inputs` → ejecutá `dir .autoflow/recordings/{numero}-*` (Windows) o `ls -la .autoflow/recordings/{numero}-*` (Linux/Mac) con `runCommands` y mostrale al QA qué archivos existen.
   - `↩️ Volver al menú sin limpiar` → marcá `session.activa: false` pero **NO** borres temporales. El QA puede regenerar después con `node .autoflow/scripts/generar-traza.js {numero}` a mano cuando arregle el problema. Como red de seguridad, `dashboard.js` también detecta path.json faltantes y los regenera al renderizar.

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

## 11. Resumen final

> ### ✅ CHECKLIST PRE-RESUMEN — releelo antes de mostrar el bloque de abajo
>
> No mostrés el resumen si alguno de estos está en falso:
>
> - [ ] El spec `tests/{slug}-{id}.spec.ts` existe y tiene el `test('{nombreCaso} [testId:{numero}]', ...)`.
> - [ ] El testset JSON `.autoflow/testsets/{slug}.json` tiene `specPath` **a nivel raíz** (no dentro de `casos[]`).
> - [ ] **`.autoflow/recordings/{numero}-path.json` existe y tiene `path[]` no vacío** ← este es el que más se olvida; sin él el dashboard muestra el Test sin pasos.
> - [ ] El sidecar de cada Page Object nueva tiene `nodos[]` y, si correspondía, `asserts[]`.
> - [ ] `.autoflow/nodos.json` tiene cada id que el sidecar referencia.
>
> Si alguno está en falso → volvé al paso correspondiente, no improvises desde acá.

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
