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

### Fingerprint de acciones (obligatorio)

Cada PO generado por AutoFlow lleva un bloque `@autoflow-fingerprint` en el JSDoc de la clase. Es la huella que usa el agente para reconocer en grabaciones futuras que ese flujo ya existe y marcarlo con tilde verde.

Formato: una línea por paso, en el orden exacto del flujo de codegen, con el shape `<acción> | <selector> | <valor opcional>`.

- **acción**: `fill`, `click`, `press`, `check`, `uncheck`, `selectOption`, `goto`.
- **selector**: la firma normalizada del locator. Ejemplos:
  - `getByLabel:Usuario`
  - `getByRole:button:Ingresar`
  - `getByPlaceholder:Buscar`
  - `getByTestId:nuevo-pago`
  - `goto:/login` (para `goto`, el selector es la URL relativa).
- **valor**: solo para `fill`/`press`/`selectOption`. Si es dato variable (un input del usuario), poné `*` en vez del valor literal para no clavarlo.

Ejemplo:

```typescript
/**
 * Pantalla de login del Mobile Banking.
 *
 * @autoflow-fingerprint
 *   fill  | getByLabel:Usuario     | *
 *   fill  | getByLabel:Contraseña  | *
 *   click | getByRole:button:Ingresar
 */
export default class LoginPage { ... }
```

Reglas:

- Mantené el orden tal como lo grabó codegen — el matcheo es secuencial.
- No incluyas asserts en el fingerprint, solo acciones del usuario.
- Si actualizás un PO existente y le cambiás el flujo, actualizá el fingerprint en el mismo cambio.

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
- Datos compartidos (usuarios de prueba, montos) viven como constantes exportadas en el mismo archivo o en `fixtures/data/`.

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
 *
 * @autoflow-fingerprint
 *   fill  | getByLabel:Usuario     | *
 *   fill  | getByLabel:Contraseña  | *
 *   click | getByRole:button:Ingresar
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
import { test, expect, usuariosPrueba } from '../fixtures';

test('TC-4521 Login con OTP', async ({ loginPage, page }) => {
  const dashboard = await loginPage.ingresar(
    usuariosPrueba.qaEstandar.usuario,
    usuariosPrueba.qaEstandar.password,
  );
  await dashboard.estaVisible();
  await expect(page).toHaveURL(/\/dashboard/);
});
```
