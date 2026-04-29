# Convenciones globales — AutoFlow

> ⚠️ **Cuando el chat mode `AutoFlow` está activo, sus instrucciones tienen prioridad sobre las de este archivo.** Estas son convenciones de código que aplican a cualquier interacción con el repo fuera de ese modo.

## Stack

- **TypeScript estricto** (mirá `tsconfig.json`).
- **`@playwright/test`** para tests, con fixtures vía `test.extend`. **No usamos clases base ni `BaseTest`**.
- Sin frameworks extra. Sin Express, sin React, sin servidores. Si algo no está en `package.json`, no lo agregues.
- Scripts en `scripts/` son CommonJS Node plano (no TypeScript).

## Estructura

| Carpeta | Para qué |
| --- | --- |
| `pages/` | Page Objects, uno por archivo. |
| `tests/` | Specs Playwright. |
| `fixtures/` | Fixtures tipadas (`test.extend`). |
| `scripts/` | Utilidades Node. |
| `.autoflow/` | Estado y prompts del agente. Ver `.autoflow/README.md`. |

## Idioma

- **Identificadores y comentarios en español rioplatense** (vos, tenés, querés).
- JSDoc en cada método público de un PO, en español.
- Mensajes de commit en español.

## Selectores en Page Objects

Orden de prioridad estricto:

1. `page.getByTestId('...')`
2. `page.getByRole('...', { name: '...' })`
3. `page.getByLabel('...')`
4. `page.getByText('...')`
5. CSS crudo — **último recurso**, comentado con `// FIXME: selector frágil, pedir data-testid al equipo de desarrollo.`

## Naming

| Cosa | Convención | Ejemplo |
| --- | --- | --- |
| Archivo PO | kebab-case + `-page.ts` | `nueva-transferencia-page.ts` |
| Clase PO | PascalCase + `Page` | `NuevaTransferenciaPage` |
| Archivo test | `tc-{numero}-{slug}.spec.ts` | `tc-4521-login-otp.spec.ts` |
| Métodos públicos | camelCase, verbo infinitivo | `ingresar`, `confirmar`, `obtenerSaldo` |
| Locators privados | camelCase con prefijo descriptivo | `botonIngresar`, `inputUsuario` |

## Reglas duras

- Nada de `any` salvo casos imposibles, siempre justificado en comentario.
- Nada de `.then()` para asserts: usar `expect()` web-first.
- Nada de `await page.waitForTimeout()`: usar locators con auto-wait o `expect().toBeVisible()`.
- Imports relativos sin extensión, agrupados (Playwright primero, luego locales).
- No commitees `.autoflow/user.json` ni nada en `.autoflow/recordings/` (ya está en `.gitignore`).

Para el detalle completo y un ejemplo plantilla, ver `.autoflow/conventions/pom-rules.md`.
