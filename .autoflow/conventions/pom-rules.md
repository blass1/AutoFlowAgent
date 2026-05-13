# Convenciones de Page Objects y Tests

Reglas que el agente sigue al generar código en este repo. **Si vas a generar o modificar un PO, un test, o una fixture, leé esto primero.**

---

## TypeScript

- **Estricto siempre**. Nada de `any` salvo casos imposibles, y siempre justificado en comentario.
- Imports relativos sin extensión (`from '../pages/LoginPage'`, no `.ts`). En Linux/CI el case del import tiene que matchear exactamente el filename.
- Imports agrupados: primero `@playwright/test`, después locales.

## Page Objects

### Una clase por archivo

- Una clase por Page Object, exportada como `export default`.
- Archivo en `pages/` con **el mismo nombre que la clase** (PascalCase + sufijo `Page.ts`). Ejemplo: clase `LoginPage` → archivo `pages/LoginPage.ts`.
- Clase en **PascalCase + sufijo `Page`**.

### Nodos — la unidad atómica del flujo

Cada acción capturada en una grabación es un **Nodo**. El nodo es lo que después permite analizar el camino que hace el usuario entre pantallas.

Shape:

```json
{
  "id": "LoginPage::fill::getByLabel:Usuario",
  "page": "LoginPage",
  "accion": "fill",
  "selector": "getByLabel:Usuario",
  "selectorRaw": "getByLabel('Usuario')",
  "valor": "*",
  "matcher": null,
  "confiabilidad": 3
}
```

- **id**: `{page}::{accion}::{selector}` — determinístico. El mismo nodo en distintas grabaciones colapsa al mismo id.
- **accion**: `goto | fill | click | press | check | uncheck | selectOption | hover | setInputFiles | dragTo | assert | capturar | verificar | accionEnLista`.
  - **Filtro de portapapeles**: el parser descarta `press` con valor `Control+C`/`Control+V`/`Meta+C`/`Meta+V` (case-insensitive). Es muy común que el QA pegue valores durante la grabación y esos shortcuts no representan una acción del usuario que queramos reproducir — además, el valor pegado ya queda capturado en el `fill` posterior. Estos nodos no aparecen en `parsed.json`, no se cuentan en el `indice` y no terminan en el PO.
- **selector**: firma normalizada del locator. Ejemplos:
  - `getByLabel:Usuario`
  - `getByRole:button:Ingresar`
  - `getByPlaceholder:Buscar`
  - `getByTestId:nuevo-pago`
  - `getByText:Bienvenido`
  - `locator:.foo > .bar`
  - `goto:/login` (para `goto`, el selector es la URL relativa).
  - `page` (para asserts a nivel page, ej: `expect(page).toHaveURL(...)`).
- **selectorRaw**: el locator tal como aparece en el spec, sin normalizar. Sirve para regenerar código.
- **valor**: input del usuario (`fill`, `press`, `selectOption`) o argumento del assert. En sidecars y `nodos.json` poné `*` cuando es dato variable, así no clava el caso particular.
- **dialogHandler** (opcional, solo en nodos de acción): `{ tipo: 'accept' | 'dismiss', valor?: string }`. Lo agrega el parser cuando codegen emitió `page.once('dialog', d => d.accept())` (o variante) **inmediatamente antes** de la acción. El método del PO debe registrar el handler con `this.page.once('dialog', d => d.accept(...))` antes de invocar el locator, sino el siguiente `actionTimeout` cuelga 15-30s esperando que el modal nativo se cierre. Sin esta propagación, los flujos con `confirm()`/`alert()`/`prompt()` nativos rompen al correrse de manera no interactiva. `tipo: 'accept'` con `valor` corresponde a un `prompt()` cuya respuesta se ingresó (mapea a `d.accept(valor)`).
- **name/label/text/placeholder variables en el selector**: la misma idea del `*` aplica al **nombre del elemento** cuando el texto que aparece en `getByRole({ name })`, `getByLabel(...)`, `getByText(...)` o `getByPlaceholder(...)` es un valor del data file (no UI fija). Ej: si el caso elige el producto "Samsung galaxy s6" y ese string vive en `dataCompraSamsungGalaxyS6.productoBuscado`, el nodo persistido es `HomePage::click::getByRole:link:*` con `selectorRaw: getByRole('link', { name: '*' })` — no `Samsung galaxy s6` literal. La fusión la dispara `generar-pom.md` paso 8.a (4) cuando detecta el match contra el data file. Sin esta fusión, cada producto generaría un nodo distinto y la HomePage no se reusaría entre Tests con productos distintos.
- **matcher**: solo para `assert`. Soportados: `toBeVisible`, `toBeHidden`, `toHaveText`, `toContainText`, `toHaveValue`, `toHaveCount`, `toHaveURL`, `toHaveTitle`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`, **`toHaveAttribute`** (lleva `valor`=nombre del atributo y `valorEsperado`=el valor a comparar), **`toHaveClass`** (lleva `valor`=string o regex literal y `modoValor: 'regex' | 'literal'`). En el resto de las acciones va `null` o se omite.
- **confiabilidad** (1-5, o `null` para `goto` y `assert`):
  - **5** — `getByTestId`
  - **4** — `getByRole` con `name`
  - **3** — `getByLabel`
  - **2** — `getByPlaceholder` / `getByText` / `locator('#id')` simple (sin combinadores)
  - **1** — otros `locator(...)` (clases, CSS posicional, XPath, atributos)

#### Page activa

Los asserts a nivel `page` (ej: `expect(page).toHaveURL(...)`) no tienen locator propio, así que se atribuyen a la **page activa**: la última page que tuvo un nodo asignado en el recording. El puntero se actualiza cada vez que un nodo se asigna a una page (por matcheo automático contra el vocabulario o por agrupación manual). Si el primer paso del recording es un assert a nivel page, queda sin atribuir hasta que se asigne el primer nodo de acción.

#### Nodos especiales: `capturar` y `verificar`

Estos nodos no se generan durante la grabación — los inserta el QA después, a través del sub-prompt [insertar-nodo-especial.md](../prompts/insertar-nodo-especial.md). Sirven para extraer un valor del DOM y compararlo más tarde contra otra lectura (o contra un literal).

- **`capturar`**: lee un valor en un punto del flujo y lo guarda en el fixture `vars` bajo un nombre.
- **`verificar`**: vuelve a leer (mismo selector u otro) y compara contra una variable previamente capturada **o** contra un valor literal, según una condición que define el QA.

Reglas de scope:
- Las variables son **per-test**: cada test arranca con un `vars` vacío. No se filtran entre tests del mismo set.
- `verificar` solo puede referenciar variables capturadas **antes** en el orden del spec. El sub-prompt valida esto antes de insertar.

Shape de `capturar`:

```json
{
  "id": "CuentasPage::capturar::saldoInicial",
  "page": "CuentasPage",
  "accion": "capturar",
  "varName": "saldoInicial",
  "selector": "getByTestId:saldo-disponible",
  "selectorRaw": "getByTestId('saldo-disponible')",
  "regex": "\\$\\s*([\\d.,]+)",
  "parser": "currency-arg",
  "confiabilidad": null
}
```

Shape de `verificar`:

```json
{
  "id": "CuentasPage::verificar::saldoInicial::disminuyo",
  "page": "CuentasPage",
  "accion": "verificar",
  "modo": "variable",
  "ref": "saldoInicial",
  "literal": null,
  "selector": "getByTestId:saldo-disponible",
  "selectorRaw": "getByTestId('saldo-disponible')",
  "regex": "\\$\\s*([\\d.,]+)",
  "parser": "currency-arg",
  "condicion": { "tipo": "disminuyo", "param": null, "unidad": null },
  "mensaje": "el saldo debió disminuir tras la transferencia",
  "confiabilidad": null
}
```

Campos:
- **id**: `{page}::capturar::{varName}` o `{page}::verificar::{varName-o-literal}::{condicion}`. Determinístico, igual que el resto.
- **varName** (capturar) / **ref** (verificar, modo `variable`): identificador JS válido (`^[a-zA-Z][a-zA-Z0-9_]*$`).
- **modo** (verificar): `"variable"` (compara contra `vars.get(ref)`) o `"literal"` (compara contra `literal`).
- **literal** (verificar, modo `literal`): valor crudo en formato string. Se parsea con el mismo `parser` antes de comparar.
- **regex** (opcional): solo aplica cuando el parser es `text` o `date`. Si está presente, se aplica al `textContent()` y se usa el primer grupo de captura. Para `number` y `currency-arg` se ignora — el parser ya descarta todo lo no-numérico internamente.
- **parser**: `text` | `number` | `currency-arg` | `date`. Vive en [data/parsers.ts](../../data/parsers.ts) y exporta funciones que aceptan el string crudo y devuelven el tipo nativo a comparar.

#### Parsers numéricos: por qué no piden regex

`parseNumber` y `parseCurrencyAR` están diseñados para que **el QA no tenga que pensar en formatos**: extraen los dígitos del string (descartando `$`, espacios, separadores de miles, palabras alrededor) y devuelven un `number`. Por eso una captura del valor `"$ 1.000.000,00"` y otra del valor `"1.000.000"` (mismo monto, distinto formato) parsean ambas a `1000000` y se comparan limpio. Las comparaciones siempre son numéricas (`>`, `<`, `===`) — no hay riesgo de que un cambio de formato del front rompa el assert.

Si el front muestra el valor con texto adicional alrededor (ej: `"Saldo disponible: $ 10.234,56 (al 04/05/2026)"`), igual no hace falta regex — el parser numérico extrae solamente los dígitos contiguos del importe principal. La regex solo es útil cuando el parser es `text` (querés extraer un substring específico) o `date` (raro, pero puede pasar con formatos no-ISO).
- **condicion** (verificar): `{ tipo, param?, unidad? }` donde `tipo ∈ { igual, distinto, aumento, disminuyo, aumentoAlMenos, disminuyoAlMenos }`. Para los dos últimos `param` es el delta y `unidad` es `"abs"` o `"pct"`.
- **confiabilidad**: siempre `null` (no aplica la escala de locator porque no son acciones del usuario).
- **htmlOrigen** *(opcional)*: bloque HTML que el QA pegó cuando armó el locator vía "HTML + intent". Se guarda como string crudo. Sirve para que [actualizar-nodos.md](../prompts/actualizar-nodos.md) compare contra el HTML actual cuando el front cambia.
- **intent** *(opcional)*: descripción en una línea de qué quiso extraer el QA (ej: `"el saldo en pesos de la cuenta CA"`). Misma motivación que `htmlOrigen`.

#### Persistencia paralela en `.autoflow/captures/`

Cuando el QA arma un locator usando "HTML + intent", además de los dos campos opcionales en el nodo, se guarda un archivo completo en `.autoflow/captures/{numero}/{key}.json` con:

```json
{
  "varName": "saldoInicial",
  "fecha": "2026-05-04T18:22:11Z",
  "intent": "el saldo en pesos de la cuenta CA",
  "htmlOrigen": "<div class=\"cuentas\">...</div>",
  "locatorPropuesto": "page.getByRole('article').filter({ hasText: 'CA' })...",
  "locatorFinal": "page.getByRole('article').filter({ hasText: 'CA' }).getByTestId('saldo')",
  "razonamiento": "Hay 4 articles tipo cuenta; filtro por 'CA' aísla la única en pesos..."
}
```

`{key}` es el `varName` (capturar) o el `ref` (verificar modo variable) o un slug del literal (verificar modo literal).

Por qué guardarlo aparte: el HTML puede ser largo (KB) y duplicarlo en `nodos.json` lo ensucia para análisis cross-recording. El nodo lleva solo el resumen; el archivo lleva la evidencia completa.

Traducción a código en el spec:

```typescript
// capturar
const _raw_saldoInicial = await cuentasPage.saldoDisponible.textContent();
vars.set('saldoInicial', parseCurrencyAR(_raw_saldoInicial ?? ''));

// verificar (modo: variable, condicion: disminuyo)
const _raw_v_saldoInicial = await cuentasPage.saldoDisponible.textContent();
expect(
  parseCurrencyAR(_raw_v_saldoInicial ?? ''),
  'el saldo debió disminuir tras la transferencia'
).toBeLessThan(vars.get<number>('saldoInicial'));
```

Mapeo de condiciones a aserciones de Playwright:
- `igual` → `.toBe(...)`
- `distinto` → `.not.toBe(...)`
- `aumento` → `.toBeGreaterThan(...)`
- `disminuyo` → `.toBeLessThan(...)`
- `aumentoAlMenos` (unidad `abs`) → `.toBeGreaterThanOrEqual(ref + param)`
- `aumentoAlMenos` (unidad `pct`) → `.toBeGreaterThanOrEqual(ref * (1 + param/100))`
- `disminuyoAlMenos` (unidad `abs`) → `.toBeLessThanOrEqual(ref - param)`
- `disminuyoAlMenos` (unidad `pct`) → `.toBeLessThanOrEqual(ref * (1 - param/100))`

Edición de archivos al insertar (sin regenerar):
- Si el selector es nuevo, se agrega como locator nuevo al PO de la `page` (`private readonly` + asignación en el constructor) y se expone un getter solo si el nodo necesita reuso entre métodos.
- Las líneas se insertan en el `.spec.ts` justo **después** del paso elegido por el QA.
- `nodos.json` y el sidecar de la page se actualizan en el mismo cambio: el nuevo id se suma a `nodos[]` en la posición que corresponda.
- El test importa el fixture `vars` desde `../fixtures` y, si usa parsers, los importa desde `../data`.

#### Nodo especial: `capturar-screen`

Captura un screenshot JPEG (quality 60, viewport only) y lo guarda en `{AUTOFLOW_RUN_DIR}/screens/{testId}/{label}_DD_MM_YYYY_HH_MM_SS.jpg`. Lo materializa como una llamada a la helper exportada por [fixtures/index.ts](../../fixtures/index.ts):

```ts
import { screen } from '../fixtures';
// ...
await screen(page, 'HomePage');
```

El helper espera `domcontentloaded` y `aria-busy=false` antes de disparar la captura — evita screens de pantallas a medio cargar. Si `AUTOFLOW_RUN_DIR` no está seteado (corrida fuera de wrapper / config), retorna `null` silenciosa sin romper el test.

**Cuándo el agente lo inserta** (auto, en `generar-pom.md`):
- **Antes y después** de un `click` cuando el `name` del botón matchea `/aceptar|continuar|confirmar|preparar|guardar|enviar|finalizar|pagar|comprar|submit/i`.
- **Al final** de un método cuando la page activa post-acción matchea `/home|overview|dashboard|main|inicio/i` (pantallas principales).
- Anti-spam: no más de 1 screen consecutivo — si ya emitió uno, salta el siguiente que caería al lado.

**Cuándo el QA lo inserta** (manual, vía `editar-caso.md` → "Insertar screenshot en un paso"): elige Test → step → label, y el sub-flujo agrega la llamada en el lugar correcto.

Shape del nodo (va a `nodos[]` del sidecar, no a `asserts[]`):

```json
{
  "id": "HomePage::capturar-screen::welcome-loaded",
  "page": "HomePage",
  "accion": "capturar-screen",
  "label": "HomePage",
  "selector": "page",
  "selectorRaw": "screen(page, 'HomePage')",
  "confiabilidad": null
}
```

Campos:
- **id**: `{page}::capturar-screen::{slug-del-label}` — determinístico. Permite reusar el mismo screen-spot entre Tests que pasan por la misma page.
- **label**: el string que va al filename y al PDF como caption (preserva mayúsculas/espacios del input del QA).
- **selector / selectorRaw**: convención de "no-locator" — el target es `page` y el raw es la llamada literal al helper. Sirve para regenerar el código.
- **confiabilidad**: siempre `null` (no hay locator a evaluar).

El parser de codegen (`parse-codegen-output.js`) **no** emite estos nodos — los agrega solo el agente (en `generar-pom.md` o `insertar-screen.md`). El dashboard los muestra en la traza con ícono 📸.

### Diccionario global — `.autoflow/nodos.json`

Archivo único en la raíz de `.autoflow/` con shape `{ [id]: nodo }`. Se enriquece con cada grabación: si el id no existe, se agrega; si existe, se valida que `accion`, `selector`, `page` y `confiabilidad` coincidan (no se sobreescribe). Es la fuente de verdad para análisis de caminos cross-recording.

#### Reemplazo de nodos (cuando un locator cambia en el front)

Cuando el sub-flow [actualizar-nodos.md](../prompts/actualizar-nodos.md) repara un locator porque el front cambió, el nodo viejo **no se borra**. Recibe dos campos extra:

```json
{
  "id": "LoginPage::click::getByRole:button:INGRESAR",
  "page": "LoginPage",
  "accion": "click",
  "selector": "getByRole:button:INGRESAR",
  "selectorRaw": "getByRole('button', { name: 'INGRESAR' })",
  "confiabilidad": 4,
  "deprecated": true,
  "reemplazadoPor": "LoginPage::click::getByTestId:btn-ingresar"
}
```

- `deprecated: true` — el nodo ya no se usa en el código vivo.
- `reemplazadoPor` — id del nodo nuevo que ocupa su lugar.

Por qué se conserva: las trazas históricas (`{numero}-path.json` de cada recording) apuntan al id viejo. Borrarlo rompería el análisis de caminos pasados. Mantenerlo `deprecated` preserva la historia y deja en claro que está retirado.

Reglas para los consumidores:
- **`actualizar-nodos.md`** ignora los nodos con `deprecated: true` al armar la lista de candidatos a reparar — no se repara algo ya reemplazado.
- **`auto-health-node.md`** ignora los `deprecated: true` al listar nodos débiles para sanear — mismo motivo.
- **`generar-pom.md`** (matcheo por vocabulario, paso 3) **sigue `reemplazadoPor`**: si el id tentativo existe pero está deprecated, resuelve al id live y matchea contra ese. Cubre el caso típico de "el grabador capturó el selector viejo en una grabación nueva pero ya tenemos uno mejor saneado por Auto-Health".
- **`generar-traza.js`** (script que arma `path.json`) **sigue `reemplazadoPor`**: si el parsed.json tiene un nodo cuyo id está deprecated, escribe en la traza el id live. Mantiene coherencia con el código del PO que ejecuta el selectorRaw del nodo live, no del deprecated.
- **`validar-coherencia.js`** chequea que ningún `deprecated: true` quede sin `reemplazadoPor` válido — refuerzo del invariante en el que confía la resolución de los puntos anteriores.
- **`grafo-nodos.js`** dibuja los `deprecated` con estilo distinto (a futuro — hoy los muestra igual).
- Las **trazas viejas no se reescriben** — preservan los ids deprecated que tenían al momento de generarse. Solo las trazas nuevas (regeneradas) usan los ids live tras seguir `reemplazadoPor`.

### Traza por recording — `.autoflow/recordings/{numero}-path.json`

Cada grabación, al cerrarse, deja una traza con la secuencia de ids visitados:

```json
{
  "numero": "12345",
  "fechaFin": "2026-04-30T18:22:11Z",
  "path": [
    "LoginPage::fill::getByLabel:Usuario",
    "LoginPage::fill::getByLabel:Contraseña",
    "LoginPage::click::getByRole:button:Ingresar",
    "OverviewPage::click::getByRole:button:Inversiones"
  ]
}
```

Este archivo **no se borra** en la limpieza final del flujo `generar-pom.md` — es histórico para análisis de caminos.

### Sidecar de page (obligatorio)

Cada PO generado por AutoFlow tiene un archivo sidecar en `.autoflow/fingerprints/{NombrePage}.json` (mismo PascalCase que la clase, sin la extensión `.ts`). Es la huella que usa el agente para reconocer en grabaciones futuras que ese flujo ya existe y marcarlo con tilde verde.

**El JSDoc del PO no lleva el sidecar** — queda solo una descripción corta de la pantalla, en español. La huella vive afuera del código.

Shape del sidecar:

```json
{
  "page": "LoginPage",
  "tipo": "page",
  "nodos": [
    "LoginPage::fill::getByLabel:Usuario",
    "LoginPage::fill::getByLabel:Contraseña",
    "LoginPage::click::getByRole:button:Ingresar"
  ],
  "asserts": [
    "LoginPage::assert::getByRole:heading:Bienvenido"
  ],
  "conecta": ["CelularesPage", "LaptopsPage"]
}
```

- **page**: nombre PascalCase del PO (sin `.ts` ni el sufijo `Page`/`Navbar` truncado).
- **tipo**: `'page'` (default, omitible) o `'componente'`. Ver sección "Componentes compartidos" abajo.
- **nodos**: **vocabulario** (set) de ids de **acciones del usuario** (sin asserts) que el agente alguna vez vio asignados a esta page. Es el contrato del matcheo en `generar-pom.md` paso 3. La definición de cada nodo (accion, selector, valor, confiabilidad) vive en `.autoflow/nodos.json`. **El orden no es semántico** — se mantiene por estabilidad visual al hacer diff, pero el matcheo no lo respeta.
- **asserts**: lista de ids de nodos `assert` que se vieron alguna vez en esta page. Se enriquece con cada grabación (sin duplicar). **No participa del matcheo** — los asserts son opcionales y pueden variar entre grabaciones del mismo flujo. Sirven para análisis y para el grafo de nodos.
- **conecta**: array de nombres de pages (PascalCase, sin `.ts`) a las que esta page lleva. Una page puede conectar a varias. Si la page es terminal, va vacío `[]`. **Componentes compartidos** (`tipo: 'componente'`) llevan `conecta: []` siempre — no son destinos de navegación.

#### Componentes compartidos (Navbar, Header, Footer)

Algunas "pantallas" no son pantallas en realidad — son **componentes globales** que viven en todo el sitio o en un sub-conjunto grande de pages. Ejemplos típicos: el navbar con `Cart`/`Log out`/`Contact`, un header con búsqueda global, un footer con enlaces. Se diferencian de las pages reales en que:

- **No tienen ciclo de vida**: no aparecen al navegar a una URL, ya estaban ahí.
- **Sus métodos son llamables desde cualquier parte del Test**, sin que la "page activa" sea relevante.
- **No deberían pertenecer a otra page**. Si el QA agrupa el `click Cart` del navbar dentro de `ProductPage`, queda erróneo: ese mismo click podría dispararse desde Home, Checkout o cualquier otra page logueada, y duplicaría el método en cada PO.

Para evitarlo, marcalos como `tipo: 'componente'` en el sidecar. Convención de naming: el QA los nombra con sufijos descriptivos que el agente reconoce automáticamente: `Navbar`, `Header`, `Footer`, `Sidebar`, `Topbar`. Si el QA tipea uno de esos nombres en el paso 5 de `generar-pom.md`, el agente:

1. Setea `tipo: 'componente'` en el sidecar.
2. Mantiene `conecta: []` (no se enriquece en el paso 6.5).
3. En el matcheo del paso 3, los componentes son **siempre candidatos** para cualquier nodo del recording (no requieren ser la "page activa"). Así el `click Cart` matchea contra `Navbar` aunque el paso anterior haya sido en ProductPage.
4. En el spec generado, el componente se instancia como cualquier otro PO en el bloque de instancias (`const navbar = new Navbar(page);`) y se invoca desde steps independientes (`await test.step('Ir al carrito', async () => navbar.irAlCarrito());`).

**Ejemplo de sidecar de componente**:
```json
{
  "page": "Navbar",
  "tipo": "componente",
  "nodos": [
    "Navbar::click::getByRole:link:Cart",
    "Navbar::click::getByRole:link:Log out",
    "Navbar::click::getByRole:link:Contact"
  ],
  "asserts": [
    "Navbar::assert::locator:#nameofuser"
  ],
  "conecta": []
}
```

> **Cuándo NO usar `tipo: 'componente'`**: si el componente solo aparece en una page (ej: un sidebar específico de la pantalla de perfil), tratalo como parte de esa page. La distinción importa solo cuando el componente es global o casi-global.

Reglas:

- **`nodos[]` es vocabulario, no flujo**: el matcheo de `generar-pom.md` paso 3 chequea si cada nodo del recording está **en el set** de algún sidecar, sin importar el orden ni si todos los ids del sidecar están en el recording. Esto permite que dos flujos parecidos (ej: comprar Samsung vs Sony) reusen las mismas pages aunque divergen en algún paso del medio.
- **No incluyas asserts en `nodos[]`** — van en `asserts[]` aparte.
- Si actualizás un PO existente y le cambiás el flujo, actualizá el sidecar y `nodos.json` en el mismo cambio.
- El JSDoc de la clase queda en **una sola línea** describiendo la pantalla en español. Nada de listar acciones ni párrafos.
- `conecta` se enriquece con cada nueva grabación. Si una grabación pasa de `LoginPage` a `CelularesPage` y `CelularesPage` no estaba en `LoginPage.conecta`, sumala (sin duplicar). Si una page nueva apunta a una existente, agregala a la `conecta` de la anterior.

### Constructor

- Recibe `page: Page` como único parámetro.
- Todos los locators son **propiedades `private readonly`** inicializadas en el constructor.
- `page` se guarda como `private readonly page: Page` para usarlo dentro de los métodos cuando haga falta (ej: `expect(this.page).toHaveURL(...)`).
- **`selectorRaw` del nodo es ground truth — copialo verbatim**. El campo `selectorRaw` en `nodos.json` tiene el chain exacto que el grabador capturó (`getByRole(...)`, `locator(...).contentFrame().getByRole(...)`, `getByRole(...).first()`, `locator(...).filter(...).getByText(...)`, etc.). Pegalo igual al constructor; **no simplifiques ni reconstruyas desde el `selector` normalizado**, porque podés perder modificadores como `.first()`, `.nth(N)`, `.filter(...)`, `.locator()` encadenados o el contenedor `iframe` — y terminás apuntando a otro elemento (o a varios, error de strict mode).

### Selectores — orden de prioridad estricto

Esta prioridad la usa **el grabador al grabar**, no el agente al generar el PO. El agente **no elige** el locator: usa el `selectorRaw` del nodo verbatim. La escala existe para evaluar fragilidad después (campo `confiabilidad`, 1-5):

1. `page.getByTestId('...')` → 5
2. `page.getByRole('...', { name: '...' })` → 4
3. `page.getByLabel('...')` → 3
4. `page.getByPlaceholder('...')` / `page.getByText('...')` / `page.locator('#id')` simple → 2 (en la práctica los devs cambian texto/i18n más seguido que ids; castigar `#id` a 1 hace que Auto-Health Node sobre-dispare)
5. `page.locator('...')` con clases, CSS posicional, XPath o atributos → 1. Sin comentarios FIXME en el PO: la fragilidad ya queda registrada en `confiabilidad: 1` del nodo y se ve en el grafo.

### Métodos públicos

- **Verbos en infinitivo**, en español: `ingresar`, `confirmar`, `obtenerSaldo`, `irATransferencias`.
- camelCase.
- Retornan `Promise<void>` o el siguiente `Page Object` si la acción provoca navegación a otra pantalla.
- **JSDoc de una sola línea**, en español, concreto sobre qué hace el método. Sin `@param` redundantes (el tipado del parámetro ya documenta). Ejemplo bueno: `/** Loguea con usuario y contraseña; devuelve el dashboard. */`. Ejemplo a evitar: párrafos largos o re-describir lo que el nombre del método ya dice.

#### Tipos de parámetros: dónde viven las interfaces

Cuando un método del PO recibe un objeto compuesto (más de 2 campos) en lugar de strings sueltos — típico en checkouts, registros, formularios largos —, la **interface del parámetro vive en el archivo del PO**, no en `data/types.ts`:

```typescript
// pages/CheckoutPage.ts
export interface DatosCompra {
  nombre: string;
  pais: string;
  ciudad: string;
  tarjeta: string;
  mes: string;
  anio: string;
}

export default class CheckoutPage {
  async comprar(datos: DatosCompra): Promise<void> { /* ... */ }
}
```

El data file del Test importa la interface del PO con `import type`:

```typescript
// data/data-compraSamsungGalaxyS6.ts
import type { DatosCompra } from '../pages/CheckoutPage';

export interface DataCompraSamsungGalaxyS6 {
  // ...
  datosCompra: DatosCompra;
}
```

**Por qué acá y no en `data/types.ts`**: la interface es **propiedad del PO** — ese PO es el único que sabe qué campos necesita. Si la movés a `data/types.ts`, te queda un grab-bag que crece con cada caso y nadie sabe qué archivo la consume. Manteniéndola junto al PO, refactor del método = refactor de la interface en el mismo file.

**`data/types.ts` queda solo para tipos transversales** que NO pertenecen a un PO: `User`, `Canal`, otros shapes que múltiples Tests comparten sin pasar por un PO específico.
- **Fidelidad al recording — todos los nodos, en orden**. El método ejecuta los nodos del rango de la page **en el mismo orden y sin saltarse ninguno**, aunque parezcan redundantes. Codegen suele emitir `click` antes de `fill` (focus + máscara + validación que el front escucha); colapsar a solo `fill` rompe formularios que dependen del focus event. Ejemplo: el rango `click(usuario) → fill(usuario, '*') → click(password) → fill(password, '*') → click(Ingresar)` se traduce a un método que hace los 5 pasos, no a `inputUsuario.fill(u); inputPassword.fill(p); botonIngresar.click()`.
- **`fill` siempre se traduce a `pressSequentially`**. Aunque el nodo lleve `accion: "fill"` en `nodos.json` (acción lógica, se mantiene así por compatibilidad con sidecars y trazas), el código emitido **siempre** usa `pressSequentially`. La razón: el front del banco tiene campos con máscara, validators on-change y autocomplete que reaccionan a cada keystroke. `fill` setea el valor de una vez y dispara un solo `input` event, lo que rompe esos campos intermitentemente. `pressSequentially` simula tipeo carácter por carácter (keydown/keyup/input por cada letra), más fiel al comportamiento del usuario real. Cuesta unos ms más por campo, pero la confiabilidad lo compensa. Ejemplo:
  ```typescript
  // ✅ Correcto
  await this.inputUsuario.pressSequentially(usuario);
  // ❌ NO usar fill, aunque el nodo diga accion: "fill"
  // await this.inputUsuario.fill(usuario);
  ```
- **Métodos retornan siempre `Promise<void>`** — sin importar si la acción dispara navegación a otra page o no. **Los POs no se conocen entre sí**: `LoginPage` no importa `OverviewPage`. Esto desacopla los Page Objects (refactor de uno no rompe el otro) y mantiene los POs reusables.
- **Métodos que disparan navegación** a otra page terminan con `await this.page.waitForLoadState('domcontentloaded')` **antes de retornar** (no instancian la próxima page). Sin esa espera, cuando el spec arranca a usar la próxima page después, el primer locator falla porque el DOM todavía no terminó de pintar. **Default `'domcontentloaded'`**, no `'networkidle'`: en sites con long-polling, analytics o WebSocket activos `networkidle` nunca se cumple (espera 500ms sin requests) y el método queda colgado los 60s del `actionTimeout`. Solo usá `'networkidle'` en SPAs sin telemetría persistente y comentá la razón.
- **El spec se encarga de instanciar las pages**, no los métodos. Ver más abajo "Estructura del Test".

### Asserts

- Web-first con `expect()` de Playwright. Nunca `.then()`.
- Si un PO necesita verificar que cargó, exponé un método `estaVisible(): Promise<void>` que haga `await expect(this.heading).toBeVisible()`.

### Buffer de tiempo per-Test (anti-solape de validación on-input y selección)

Cuando el QA crea un **Test**, `crear-caso.md` paso 1.6 le pregunta si activar un **buffer de 500ms**. La decisión se persiste en `session.json` como `bufferTiempo: true | false`. Si está en `true`, `generar-pom.md` paso 6 emite el wait **después de cada acción de input/selección** dentro de un método público — concretamente: `pressSequentially`, `click`, `check`, `uncheck`, `selectOption`. Ejemplo con dos inputs y un click de avanzar:

El wait se emite invocando el helper `bufferEntreAcciones` que vive en `fixtures/index.ts`:

```typescript
import { bufferEntreAcciones } from '../fixtures';

// dentro del método del PO:
await this.usuario.pressSequentially(usuario);
await bufferEntreAcciones(this.page);
await this.password.pressSequentially(password);
await bufferEntreAcciones(this.page);
await this.botonIngresar.click();
await bufferEntreAcciones(this.page);
```

El helper hace `await page.waitForTimeout(500)` internamente y respeta la env var `AUTOFLOW_BUFFER_MS` (entero) si el QA quiere subir/bajar el valor global sin tocar cada PO. **No emitas `await this.page.waitForTimeout(500)` literal** — usá siempre el helper, así el valor queda centralizado. **Tampoco** emitas comentarios repitiendo "buffer anti-solape": el nombre del helper ya documenta el intento.

Cubre tres casos típicos:
- **input → input**: la validación on-input del primero se emite antes del siguiente focus.
- **input → click de avanzar/continuar/siguiente**: el botón se habilita después de que terminó de validar.
- **click → click rápido (típicamente checkboxes/toggles consecutivos)**: cada checkbox/toggle se procesa antes del siguiente. Sin esto, el segundo click suele ejecutarse antes de que el front terminó de aplicar el primero y el estado queda inconsistente.

**Excepciones — NO emitir el wait** si:
- La siguiente línea ya es `await this.page.waitForLoadState(...)` (redundante: la espera de carga cubre la espera de buffer).
- La acción es la **última del método** y el método dispara navegación (cerrás con `waitForLoadState('domcontentloaded')` en lugar de waitForTimeout).

Es el único lugar donde `waitForTimeout` se inserta de forma "automática" — el resto de las esperas siguen las reglas de la próxima sección.

**Herencia**: en flujos que reusan un **Test** existente (añadir pasos al final, bifurcar, insertar nodo especial), el setting se hereda de la sesión del **Test** original. Si la sesión original no tiene el campo (Tests viejos previos a esta convención), se asume `false`. Por lo tanto el buffer queda **baked en el método del PO** en el momento de generación: si dos **Tests** comparten el mismo PO con buffer distinto, gana el primero que lo generó. Para cambiar después, editar el PO a mano.

### Esperas

- **Preferí siempre el auto-wait** de los locators y `expect(...).toBeVisible()` / `toHaveText()`. Para navegaciones, `await this.page.waitForLoadState('domcontentloaded')` dentro del método del PO que dispara la navegación. `'networkidle'` solo en SPAs sin long-polling/analytics, con comentario justificando.
- **`waitForTimeout` está permitido como último recurso**, pero **siempre con un comentario `// Wait: <razón concreta>`** en la línea anterior. La razón tiene que decir qué se está esperando (animación CSS, JS de terceros, redirect lento del banco), no algo genérico tipo "esperar". Ejemplos válidos:
  ```typescript
  // Wait: animación de cierre del modal de OTP (no expone evento).
  await this.page.waitForTimeout(800);
  ```
  Sin la justificación concreta, **no lo escribas** — buscá primero un selector mejor o un `expect` con `toBeVisible`.
- El front del banco es lento. Si un método entero necesita más cuerda, mejor cambiar el `actionTimeout` del fixture de ese caso particular antes que sembrar `waitForTimeout` por todos lados.

## Tests

- Archivo en `tests/` con nombre `{slug}-{idTestSet}.spec.ts` (un spec por **Test Set**, no por **Test**). El `slug` es camelCase del nombre del **Test Set**; el id va separado por un único guion. Ejemplo: **Test Set** `Dolar MEP` con id `12345` → `tests/dolarMep-12345.spec.ts`.
- Usar `test.extend` desde `fixtures/index.ts`. **Nada de clases base, nada de `BaseTest`.**

### Estructura: `test.describe` + instancias arriba + `test.step`

Cada **Test Set** = un único `test.describe` que envuelve a todos los `test()` del set. Cada **Test** dentro = un `test('...')` con esta estructura **fija**:

1. **Destructuring del data file** del Test Set.
2. **Bloque de instancias** de todas las **Page Objects** que el Test usa, una por línea, prolijas (`const loginPage = new LoginPage(page);`).
3. **Pasos** del flujo en `test.step('comentario corto', async () => { ... })`.

**Formato de los nombres** (contrato del repo, no improvisar):
- Describe: `"{nombreTestSet} [testSetId:{id}]"` — ej: `"Dolar MEP [testSetId:12345]"`.
- Test: `"{nombreCaso} [testId:{numero}]"` — ej: `"Compra de dolar mep con CA [testId:43213]"`.
- **Sin prefijo `TC-`** ni nada antes del nombre. El id va al final entre corchetes con la key correspondiente (`testSetId` o `testId`).

**Reglas de las instancias**:
- Todas las instancias **van al principio del `test()`**, después del destructuring de data, **antes** de cualquier `test.step`.
- Una por línea, sin separación con líneas en blanco entre ellas — quedan como un bloque visualmente prolijo.
- Naming: el nombre de la variable es la **clase en camelCase** (primera letra minúscula). Ej: `LoginPage` → `loginPage`, `AccesoFimaPage` → `accesoFimaPage`.
- Aunque una page se use en un solo step, igual va arriba con las demás — el bloque del cabezal del test es la lista visual de "qué pantallas toca este caso".

**Reglas de `test.step`**:
- Cada acción lógica del **Test** (abrir el canal, loguearse, navegar a una pantalla, ejecutar la operación, verificar) va envuelta en `await test.step('comentario corto', async () => { ... })`.
- El comentario describe **qué hace el paso** desde la perspectiva del usuario (`'Loguearse y entrar al overview'`, `'Suscribir al fondo Fima Premium'`). No hablar de tipos ni clases.
- **El step llama a métodos del PO**: `await loginPage.ingresar(usuarioPrincipal.user, usuarioPrincipal.pass);`. Los métodos retornan `Promise<void>` — no se asigna a una `const`.
- El `await page.goto(urlInicial)` va en su propio step (`'Abrir el canal'`).
- Una declaración por step. No mezclar dos navegaciones distintas en el mismo step — partilas.

### `test.use({ storageState })`

Si el caso arranca logueado, va **dentro del `describe`** (afecta a todos los `test()` del set):

```typescript
test.describe('Dolar MEP [testSetId:12345]', () => {
  test.use({ storageState: '.autoflow/auth/icbc-prod-usuarioPrincipal.json' });

  test('Compra de dolar mep con CA [testId:43213]', async ({ page }) => { ... });
});
```

Si distintos **Tests** del set necesitan distintos storage states, usá `test.use` dentro de un `test.describe` anidado o repensá si en realidad son **Test Sets** distintos.

## Fixtures

- Centralizadas en `fixtures/index.ts`.
- `test.extend` con fixtures tipadas mediante un `type` local.
- **No** definas datos de prueba acá. Solo fixtures (`page`, POs precargados, sesiones). Los datos viven en `data/` (ver abajo).

## Datos de prueba — `data/`

Los inputs de los tests (usuarios, contraseñas, montos, búsquedas, cuentas, etc.) **siempre** viven en archivos `.ts` dentro de `data/` en la raíz. Nunca hardcodees literales en el spec ni en el PO.

### Cada Test Set se autocontiene en su propio `data-{slug}.ts`

**No hay catálogo central de usuarios.** Cada **Test Set** define sus usuarios, contraseñas, montos y datos en un único archivo: `data/data-{slugTestSet}.ts`. El archivo declara una **interface** propia que tipa la forma del data file y exporta una constante con los valores.

Ventaja: cada **Test Set** es independiente. Un cambio en un set no afecta a otros, y el archivo se lee de punta a punta sin saltar entre archivos.

### `data/types.ts` (compartido — solo contratos genéricos)

```typescript
export interface User {
  canal: string;
  user: string;
  pass: string;
  dni?: string;
}

export interface Canal {
  nombre: string;
  url: string;
}
```

`User` y `Canal` son tipos reusables: cada `data-{slug}.ts` los importa para tipar sus campos de usuario y URL.

### `data/data-{slugTestSet}.ts` — autocontenido (interface + valores)

Un archivo por **Test Set**, naming `data-{slug}.ts` donde `slug` es el camelCase del nombre del **Test Set** (mismo slug que el spec y el JSON del set).

```typescript
import type { User } from './types';

export interface DataDolarMep {
  urlInicial: string;
  usuarioPrincipal: User;
  importeOperacion: number;
  cuentaOrigen: string;
}

export const dataDolarMep: DataDolarMep = {
  urlInicial: 'https://www.banco.com.ar/personas',
  usuarioPrincipal: {
    canal: 'BANCO HOMO',
    user: 'qa.estandar',
    pass: 'Qa12345!',
    dni: '12345678',
  },
  importeOperacion: 100000,
  cuentaOrigen: '0290011200000000123456',
};
```

Reglas:
- La interface se llama `Data{PascalSlug}` y la constante `data{PascalSlug}` (ej: `DataDolarMep` / `dataDolarMep`).
- **No usar `as const`** — la interface ya da el contrato de tipos.
- Los usuarios viven como propiedades del data file (`usuarioPrincipal`, `usuarioVendedor`, etc.), tipados con `User`. Si el flujo usa varios usuarios, asigná un nombre distinto a cada uno (no agrupes en un sub-objeto `usuarios`).
- Las contraseñas en homologación quedan en texto plano. El password se mueve solo si cambia en homologación.
- Las keys internas describen el rol del dato en el flujo (`importeOperacion`, `cuentaOrigen`), no el valor.
- **Números siempre planos**: sin separadores de miles ni decimales formateados. `100000` ✓, `100.000` ✗, `100_000` ✗, `'100.000'` ✗. Si el formulario exige el valor con separador, formatealo en el método del PO al hacer el `fill`, no en el data file.

### `data/index.ts`

Re-exporta tipos compartidos, urls y los data files de cada **Test Set**:

```typescript
export * from './types';
export * from './urls';
export * from './parsers';
export * from './data-dolarMep';
// (sumá una línea por cada data-{slug}.ts que crees)
```

### Uso en el spec

```typescript
import { dataDolarMep } from '../data';

const { urlInicial, usuarioPrincipal, importeOperacion } = dataDolarMep;
await login.ingresar(usuarioPrincipal.user, usuarioPrincipal.pass);
```

El spec destructura el `data{PascalSlug}` al inicio del `test()` y pasa los **campos primitivos** a los métodos del PO (`usuarioPrincipal.user`, no `usuarioPrincipal` entero — los métodos reciben strings, no `User`).

## Naming — tabla resumen

| Cosa | Convención | Ejemplo |
| --- | --- | --- |
| Archivo PO | PascalCase + `Page.ts` | `NuevaTransferenciaPage.ts` |
| Clase PO | PascalCase + `Page` | `NuevaTransferenciaPage` |
| Archivo test | `{slug}-{idTestSet}.spec.ts` | `regresionDeCompras-44534.spec.ts` |
| Slug test set | camelCase del nombre | `regresionDeCompras` |
| Subcarpeta `pages/` | camelCase | `pages/mobileBanking/` |
| Método público | camelCase, verbo infinitivo | `completarDatos`, `confirmar` |
| Locator privado | camelCase con prefijo descriptivo | `botonIngresar`, `inputUsuario`, `headingTitulo` |

## Estructura de carpetas en `pages/`

Si la URL tiene jerarquía significativa, reflejala:

```
pages/
├── LoginPage.ts
├── DashboardPage.ts
├── transferencias/
│   ├── NuevaPage.ts
│   └── ConfirmacionPage.ts
└── admin/
    └── UsuariosPage.ts
```

---

# Ejemplo plantilla — usalo como referencia

## Page Object: `pages/LoginPage.ts`

```typescript
import { expect, Locator, Page } from '@playwright/test';

/** Pantalla de login del Mobile Banking. */
export default class LoginPage {
  private readonly inputUsuario: Locator;
  private readonly inputPassword: Locator;
  private readonly botonIngresar: Locator;
  private readonly heading: Locator;

  constructor(private readonly page: Page) {
    this.inputUsuario = page.getByLabel('Usuario');
    this.inputPassword = page.getByLabel('Contraseña');
    this.botonIngresar = page.getByRole('button', { name: 'Ingresar' });
    this.heading = page.getByRole('heading', { name: 'Iniciar sesión' });
  }

  /** Verifica que la pantalla de login esté visible. */
  async estaVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  /** Loguea con usuario y contraseña; deja al usuario en el dashboard. */
  async ingresar(usuario: string, password: string): Promise<void> {
    // El recording capturó click+fill por cada input. Los preservamos: el front
    // del banco escucha el focus event para activar la máscara del password.
    await this.inputUsuario.click();
    await this.inputUsuario.pressSequentially(usuario);
    await this.inputPassword.click();
    await this.inputPassword.pressSequentially(password);
    await this.botonIngresar.click();
    await this.page.waitForLoadState('domcontentloaded');
    // No retornamos DashboardPage — el spec se encarga de instanciarla al inicio.
  }
}
```

> Notá: **no hay `import DashboardPage from './DashboardPage'`**. Los Page Objects no se conocen entre sí. El spec instancia las pages que necesita.

## Page Object: `pages/DashboardPage.ts`

```typescript
import { expect, Locator, Page } from '@playwright/test';

/** Home del usuario logueado. */
export default class DashboardPage {
  private readonly heading: Locator;
  private readonly linkTransferencias: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Mis cuentas' });
    this.linkTransferencias = page.getByRole('link', { name: 'Transferencias' });
  }

  /** Verifica que el dashboard esté visible. */
  async estaVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }
}
```

## Fixture: `fixtures/index.ts`

```typescript
import { test as base } from '@playwright/test';
import LoginPage from '../pages/LoginPage';

type AutoFlowFixtures = {
  loginPage: LoginPage;
};

export const test = base.extend<AutoFlowFixtures>({
  loginPage: async ({ page }, use) => {
    await page.goto('/');
    const login = new LoginPage(page);
    await login.estaVisible();
    await use(login);
  },
});

export { expect } from '@playwright/test';
```

> Los **datos** no van en `fixtures/`. Van en `data/data-{slugTestSet}.ts` — cada **Test Set** se autocontiene (interface + usuarios + datos).

## Test: `tests/dolarMep-12345.spec.ts`

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

## Datos: `data/data-dolarMep.ts`

```typescript
import type { User } from './types';

export interface DataDolarMep {
  urlInicial: string;
  usuarioPrincipal: User;
  importeOperacion: number;
}

export const dataDolarMep: DataDolarMep = {
  urlInicial: 'https://www.banco.com.ar/personas',
  usuarioPrincipal: {
    canal: 'BANCO HOMO',
    user: 'qa.estandar',
    pass: 'Qa12345!',
    dni: '12345678',
  },
  importeOperacion: 100000,
};
```
