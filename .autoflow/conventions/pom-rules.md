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

### Diccionario global — `.autoflow/nodos.json`

Archivo único en la raíz de `.autoflow/` con shape `{ [id]: nodo }`. Se enriquece con cada grabación: si el id no existe, se agrega; si existe, se valida que `accion`, `selector`, `page` y `confiabilidad` coincidan (no se sobreescribe). Es la fuente de verdad para análisis de caminos cross-recording.

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
- El JSDoc de la clase queda corto: una o dos líneas describiendo la pantalla. Nada de listar acciones.
- `conecta` se enriquece con cada nueva grabación. Si una grabación pasa de `LoginPage` a `CelularesPage` y `CelularesPage` no estaba en `LoginPage.conecta`, sumala (sin duplicar). Si una page nueva apunta a una existente, agregala a la `conecta` de la anterior.

### Constructor

- Recibe `page: Page` como único parámetro.
- Todos los locators son **propiedades `private readonly`** inicializadas en el constructor.
- `page` se guarda como `private readonly page: Page` para usarlo dentro de los métodos cuando haga falta (ej: `expect(this.page).toHaveURL(...)`).

### Selectores — orden de prioridad estricto

1. `page.getByTestId('...')`
2. `page.getByRole('...', { name: '...' })`
3. `page.getByLabel('...')`
4. `page.getByText('...')`
5. CSS crudo → **último recurso**, comentado:
   ```typescript
   // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
   private readonly botonOscuro: Locator;
   ```

### Métodos públicos

- **Verbos en infinitivo**, en español: `ingresar`, `confirmar`, `obtenerSaldo`, `irATransferencias`.
- camelCase.
- Retornan `Promise<void>` o el siguiente `Page Object` si la acción provoca navegación a otra pantalla.
- **JSDoc en español** en cada método público con descripción y `@param` por parámetro.

### Asserts

- Web-first con `expect()` de Playwright. Nunca `.then()`.
- Si un PO necesita verificar que cargó, exponé un método `estaVisible(): Promise<void>` que haga `await expect(this.heading).toBeVisible()`.

### Esperas

- Nada de `await page.waitForTimeout(...)`.
- Confiar en el auto-wait de los locators y en `expect(...).toBeVisible()` / `toHaveText()`.

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

- Un archivo por dominio: `data/usuarios.ts`, `data/montos.ts`, `data/cuentas.ts`, etc.
- Cada archivo exporta una constante nombrada con `as const` (objeto agrupado, no variables sueltas).
- `data/index.ts` re-exporta todo (`export * from './usuarios';`) para que los specs hagan `import { usuarios } from '../data';`.
- Si un spec necesita un dato que todavía no está en `data/`, **agregalo ahí primero** y después usalo. No lo metas inline.
- Naming: la constante en camelCase y plural cuando agrupa (`usuarios`, `montos`); las claves internas describen el escenario (`qaEstandar`, `clienteVip`, `transferenciaChica`).

Ejemplo `data/usuarios.ts`:
```typescript
export const usuarios = {
  qaEstandar: { usuario: 'qa.test', password: 'Qa12345!' },
} as const;
```

Uso en el spec:
```typescript
import { usuarios } from '../data';
await login.ingresar(usuarios.qaEstandar.usuario, usuarios.qaEstandar.password);
```

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

/**
 * Pantalla de login del Mobile Banking.
 */
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

  /**
   * Verifica que la pantalla de login esté visible.
   */
  async estaVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  /**
   * Ingresa con usuario y contraseña, y devuelve la pantalla siguiente.
   * @param usuario  Nombre de usuario.
   * @param password Contraseña en texto plano (homologación).
   */
  async ingresar(usuario: string, password: string): Promise<DashboardPage> {
    await this.inputUsuario.fill(usuario);
    await this.inputPassword.fill(password);
    await this.botonIngresar.click();
    return new DashboardPage(this.page);
  }
}
```

## Page Object: `pages/DashboardPage.ts`

```typescript
import { expect, Locator, Page } from '@playwright/test';

/**
 * Home del usuario logueado.
 */
export default class DashboardPage {
  private readonly heading: Locator;
  private readonly linkTransferencias: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Mis cuentas' });
    this.linkTransferencias = page.getByRole('link', { name: 'Transferencias' });
  }

  /**
   * Verifica que el dashboard esté visible.
   */
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

/**
 * Datos de usuarios de prueba para homologación.
 */
export const usuariosPrueba = {
  qaEstandar: { usuario: 'qa.test', password: 'Qa12345!' },
} as const;
```

## Test: `tests/regresionDeLogin-4521.spec.ts`

```typescript
import { test, expect } from '../fixtures';
import { usuarios } from '../data';

test('TC-4521 Login con OTP', async ({ loginPage, page }) => {
  const dashboard = await loginPage.ingresar(
    usuarios.qaEstandar.usuario,
    usuarios.qaEstandar.password,
  );
  await dashboard.estaVisible();
  await expect(page).toHaveURL(/\/dashboard/);
});
```
