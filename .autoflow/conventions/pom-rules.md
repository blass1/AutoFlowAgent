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
- **accion**: `goto | fill | click | press | check | uncheck | selectOption | hover | dragTo | assert`.
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
- **matcher**: solo para `assert` (`toBeVisible`, `toHaveText`, `toHaveURL`, etc.). En el resto va `null` o se omite.
- **confiabilidad** (1-5, o `null` para `goto` y `assert`):
  - **5** — `getByTestId`
  - **4** — `getByRole` con `name`
  - **3** — `getByLabel`
  - **2** — `getByPlaceholder` / `getByText`
  - **1** — `locator(...)` con CSS crudo o posicional

#### Page activa

Los asserts a nivel `page` (ej: `expect(page).toHaveURL(...)`) no tienen locator propio, así que se atribuyen a la **page activa**: la última page que tuvo un nodo asignado en el recording. El puntero se actualiza cada vez que un nodo se asigna a una page (por matcheo de prefijo o por agrupación manual). Si el primer paso del recording es un assert a nivel page, queda sin atribuir hasta que el QA agrupe el primer bloque "Nuevo".

#### Nodos especiales: `capturar` y `verificar`

Estos nodos no se generan en codegen — los inserta el QA después de grabar a través del sub-prompt [insertar-nodo-especial.md](../prompts/insertar-nodo-especial.md). Sirven para extraer un valor del DOM y compararlo más tarde contra otra lectura (o contra un literal).

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
- **`actualizar-nodos.md`** ignora los nodos con `deprecated: true` al armar la lista de candidatos a reparar.
- **`generar-pom.md`** (matcheo de prefijo, paso 3) ignora los `deprecated: true` — solo matchea contra ids vivos.
- **`grafo-nodos.js`** dibuja los `deprecated` con estilo distinto (a futuro — hoy los muestra igual).
- Las **trazas no se reescriben** nunca, aunque sus ids estén deprecated.

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

- **nodos**: lista ordenada de ids de **acciones del usuario** (sin asserts). Es el contrato del matcheo de prefijo en `generar-pom.md`. La definición de cada nodo (accion, selector, valor, confiabilidad) vive en `.autoflow/nodos.json`.
- **asserts**: lista de ids de nodos `assert` que se vieron alguna vez en esta page. Se enriquece con cada grabación (sin duplicar). **No participa del matcheo de prefijo** — los asserts son opcionales y pueden variar entre grabaciones del mismo flujo. Sirven para análisis y para el grafo de nodos.
- **conecta**: array de nombres de pages (PascalCase, sin `.ts`) a las que esta page lleva. Una page puede conectar a varias. Si la page es terminal, va vacío `[]`.

Reglas:

- Mantené el orden tal como lo grabó codegen — el matcheo es secuencial.
- **No incluyas asserts en `nodos[]`** — van en `asserts[]` aparte.
- Si actualizás un PO existente y le cambiás el flujo, actualizá el sidecar y `nodos.json` en el mismo cambio.
- El JSDoc de la clase queda en **una sola línea** describiendo la pantalla en español. Nada de listar acciones ni párrafos.
- `conecta` se enriquece con cada nueva grabación. Si una grabación pasa de `LoginPage` a `CelularesPage` y `CelularesPage` no estaba en `LoginPage.conecta`, sumala (sin duplicar). Si una page nueva apunta a una existente, agregala a la `conecta` de la anterior.

### Constructor

- Recibe `page: Page` como único parámetro.
- Todos los locators son **propiedades `private readonly`** inicializadas en el constructor.
- `page` se guarda como `private readonly page: Page` para usarlo dentro de los métodos cuando haga falta (ej: `expect(this.page).toHaveURL(...)`).
- **`selectorRaw` del nodo es ground truth — copialo verbatim**. El campo `selectorRaw` en `nodos.json` tiene el chain exacto que codegen capturó (`getByRole(...)`, `locator(...).contentFrame().getByRole(...)`, `getByRole(...).first()`, `locator(...).filter(...).getByText(...)`, etc.). Pegalo igual al constructor; **no simplifiques ni reconstruyas desde el `selector` normalizado**, porque podés perder modificadores como `.first()`, `.nth(N)`, `.filter(...)`, `.locator()` encadenados o el contenedor `iframe` — y terminás apuntando a otro elemento (o a varios, error de strict mode).

### Selectores — orden de prioridad estricto

Esta prioridad la usa **codegen al grabar**, no el agente al generar el PO. El agente **no elige** el locator: usa el `selectorRaw` del nodo verbatim. La escala existe para evaluar fragilidad después (campo `confiabilidad`, 1-5):

1. `page.getByTestId('...')` → 5
2. `page.getByRole('...', { name: '...' })` → 4
3. `page.getByLabel('...')` → 3
4. `page.getByPlaceholder('...')` / `page.getByText('...')` → 2
5. `page.locator('...')` (CSS crudo) → 1. Sin comentarios FIXME en el PO: la fragilidad ya queda registrada en `confiabilidad: 1` del nodo y se ve en el grafo.

### Métodos públicos

- **Verbos en infinitivo**, en español: `ingresar`, `confirmar`, `obtenerSaldo`, `irATransferencias`.
- camelCase.
- Retornan `Promise<void>` o el siguiente `Page Object` si la acción provoca navegación a otra pantalla.
- **JSDoc de una sola línea**, en español, concreto sobre qué hace el método. Sin `@param` redundantes (el tipado del parámetro ya documenta). Ejemplo bueno: `/** Loguea con usuario y contraseña; devuelve el dashboard. */`. Ejemplo a evitar: párrafos largos o re-describir lo que el nombre del método ya dice.
- **Fidelidad al recording — todos los nodos, en orden**. El método ejecuta los nodos del rango de la page **en el mismo orden y sin saltarse ninguno**, aunque parezcan redundantes. Codegen suele emitir `click` antes de `fill` (focus + máscara + validación que el front escucha); colapsar a solo `fill` rompe formularios que dependen del focus event. Ejemplo: el rango `click(usuario) → fill(usuario, '*') → click(password) → fill(password, '*') → click(Ingresar)` se traduce a un método que hace los 5 pasos, no a `inputUsuario.fill(u); inputPassword.fill(p); botonIngresar.click()`.
- **`fill` siempre se traduce a `pressSequentially`**. Aunque el nodo lleve `accion: "fill"` en `nodos.json` (acción lógica, se mantiene así por compatibilidad con sidecars y trazas), el código emitido **siempre** usa `pressSequentially`. La razón: el front del banco tiene campos con máscara, validators on-change y autocomplete que reaccionan a cada keystroke. `fill` setea el valor de una vez y dispara un solo `input` event, lo que rompe esos campos intermitentemente. `pressSequentially` simula tipeo carácter por carácter (keydown/keyup/input por cada letra), más fiel al comportamiento del usuario real. Cuesta unos ms más por campo, pero la confiabilidad lo compensa. Ejemplo:
  ```typescript
  // ✅ Correcto
  await this.inputUsuario.pressSequentially(usuario);
  // ❌ NO usar fill, aunque el nodo diga accion: "fill"
  // await this.inputUsuario.fill(usuario);
  ```
- **Métodos que devuelven otra page** terminan con `await this.page.waitForLoadState('networkidle')` (o `'domcontentloaded'` si `networkidle` se cuelga por long-polling) **antes** del `return new SiguientePage(this.page)`. Sin eso, el siguiente PO se instancia mientras el DOM todavía no terminó de pintar y el primer locator del nuevo PO falla en `actionTimeout`.

### Asserts

- Web-first con `expect()` de Playwright. Nunca `.then()`.
- Si un PO necesita verificar que cargó, exponé un método `estaVisible(): Promise<void>` que haga `await expect(this.heading).toBeVisible()`.

### Esperas

- **Preferí siempre el auto-wait** de los locators y `expect(...).toBeVisible()` / `toHaveText()`. Para navegaciones, `await this.page.waitForLoadState('networkidle')` o `'domcontentloaded'` dentro del método del PO que dispara la navegación.
- **`waitForTimeout` está permitido como último recurso**, pero **siempre con un comentario `// Wait: <razón concreta>`** en la línea anterior. La razón tiene que decir qué se está esperando (animación CSS, JS de terceros, redirect lento del banco), no algo genérico tipo "esperar". Ejemplos válidos:
  ```typescript
  // Wait: animación de cierre del modal de OTP (no expone evento).
  await this.page.waitForTimeout(800);
  ```
  Sin la justificación concreta, **no lo escribas** — buscá primero un selector mejor o un `expect` con `toBeVisible`.
- El front del banco es lento. Si un método entero necesita más cuerda, mejor cambiar el `actionTimeout` del fixture de ese caso particular antes que sembrar `waitForTimeout` por todos lados.

## Tests

- Archivo en `tests/` con nombre `{slug}-{idTestSet}.spec.ts` (un spec por test set, no por caso). El `slug` es camelCase del nombre del test set; el id va separado por un único guion. Ejemplo: test set `Regresion de compras` con id `44534` → `tests/regresionDeCompras-44534.spec.ts`.
- Usar `test.extend` desde `fixtures/index.ts`. **Nada de clases base, nada de `BaseTest`.**
- Cada test arranca con `await page.goto(urlInicial)` o usa una fixture que lo haga por él.
- Nombre del test: `'TC-{numero} {nombre}'`.

## Fixtures

- Centralizadas en `fixtures/index.ts`.
- `test.extend` con fixtures tipadas mediante un `type` local.
- **No** definas datos de prueba acá. Solo fixtures (`page`, POs precargados, sesiones). Los datos viven en `data/` (ver abajo).

## Datos de prueba — `data/`

Los inputs de los tests (usuarios, montos, búsquedas, cuentas, etc.) **siempre** viven en archivos `.ts` dentro de `data/` en la raíz. Nunca hardcodees literales en el spec ni en el PO.

La estructura tiene **dos capas**:

1. **`data/usuarios.ts`** — catálogo único de usuarios reusables. Cada usuario respeta la interface `User`. Si una contraseña cambia acá, se propaga a todos los test sets que lo usen.
2. **`data/data-{slugTestSet}.ts`** — un archivo por test set. Contiene los datos específicos de ese test set (montos, búsquedas, productos, etc.) y **referencia a `usuarios`** para asociar el escenario con un usuario concreto.

Ambas capas se re-exportan desde `data/index.ts`.

### `data/types.ts`

```typescript
export interface User {
  canal: string;
  user: string;
  pass: string;
  dni?: string;
}
```

### `data/usuarios.ts`

```typescript
import type { User } from './types';

export const usuarios = {
  qaIcbcEstandar: {
    canal: 'ICBC PROD',
    user: 'qa.estandar',
    pass: 'Qa12345!',
    dni: '12345678',
  },
} as const satisfies Record<string, User>;
```

- La key del usuario describe el **escenario + canal** (`qaIcbcEstandar`, `clienteVipIcbc`, `qaDemoblaze`), no el valor.
- `as const satisfies Record<string, User>` da inmutabilidad y validación de shape al mismo tiempo.

### `data/data-{slugTestSet}.ts`

Un archivo por test set, naming `data-{slug}.ts` donde `slug` es el camelCase del nombre del test set (mismo slug que el spec y el JSON del set).

```typescript
import { usuarios } from './usuarios';

export const dataRegresionDeCompras = {
  loginPrincipal: usuarios.qaIcbcEstandar,
  importeTransferencia: 100000,
  productoBuscado: 'iPhone 15',
  cuentaDestino: '0290011200000000123456',
} as const;
```

- La constante exportada se llama `data{PascalCase del slug}` (ej: `dataRegresionDeCompras`).
- Las keys internas describen el rol del dato en el flujo (`loginPrincipal`, `importeTransferencia`), no el valor.
- **Números siempre planos**: sin separadores de miles ni decimales formateados. `100000` ✓, `100.000` ✗, `100_000` ✗, `'100.000'` ✗. Esto vale para montos, IDs, números de cuenta, etc. Si el front muestra `$100.000`, el dato del test es `100000` — el formateo lo hace la UI, no el data file. Si el formulario **exige** el valor con separador para aceptarlo, formatealo en el momento del `fill` (en el método del PO), no en el data file.

### `data/index.ts`

Re-exporta todo:

```typescript
export * from './types';
export * from './usuarios';
export * from './data-regresionDeCompras';
// (sumá una línea por cada data-{slug}.ts que crees)
```

### Uso en el spec

```typescript
import { dataRegresionDeCompras } from '../data';

const { loginPrincipal, importeTransferencia } = dataRegresionDeCompras;
await login.ingresar(loginPrincipal.user, loginPrincipal.pass);
```

El spec **nunca** importa `usuarios` directamente; siempre pasa por el `data-{slug}.ts` del test set. Eso da una sola fuente de verdad por test set y deja la composición de usuario+datos en un lugar visible.

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
import DashboardPage from './DashboardPage';

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

  /** Loguea con usuario y contraseña; devuelve el dashboard. */
  async ingresar(usuario: string, password: string): Promise<DashboardPage> {
    // Codegen capturó click+fill por cada input. Los preservamos: el front
    // del banco escucha el focus event para activar la máscara del password.
    await this.inputUsuario.click();
    await this.inputUsuario.fill(usuario);
    await this.inputPassword.click();
    await this.inputPassword.fill(password);
    await this.botonIngresar.click();
    await this.page.waitForLoadState('networkidle');
    return new DashboardPage(this.page);
  }
}
```

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

> Los **datos** no van en `fixtures/`. Van en `data/usuarios.ts` (catálogo de usuarios) y en `data/data-{slugTestSet}.ts` (datos del test set, que referencia a `usuarios`).

## Test: `tests/regresionDeLogin-4521.spec.ts`

```typescript
import { test, expect } from '../fixtures';
import { dataRegresionDeLogin } from '../data';
import LoginPage from '../pages/LoginPage';

test('TC-4521 Login con OTP', async ({ page }) => {
  const { urlInicial, loginPrincipal } = dataRegresionDeLogin;

  await page.goto(urlInicial);
  const login = new LoginPage(page);

  const dashboard = await login.ingresar(loginPrincipal.user, loginPrincipal.pass);
  await dashboard.estaVisible();
});
```

## Datos: `data/data-regresionDeLogin.ts`

```typescript
import { usuarios } from './usuarios';

export const dataRegresionDeLogin = {
  urlInicial: 'https://www.icbc.com.ar/personas',
  loginPrincipal: usuarios.qaIcbcEstandar,
} as const;
```
