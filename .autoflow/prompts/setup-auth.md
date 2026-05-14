---
mode: agent
description: Graba un login reusable (storageState) para que los casos arranquen ya logueados sin re-grabar el login cada vez.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Configurar login reusable

Sirve para grabar **una sola vez** el login de un usuario en un canal y reusarlo en todos los casos que arranquen logueados. Lo que se guarda es el `storageState` de Playwright (cookies + localStorage), no la contraseña.

> ⚠️ Los archivos de `.autoflow/auth/` contienen tokens de sesión sensibles. Están en `.gitignore`. **No commitearlos**, ni siquiera en homologación.

## 1. Mostrar lo que ya hay

Listá los archivos de `.autoflow/auth/*.json` (excluí `.gitkeep`). Cada archivo se llama `{canal-slug}-{userKey}.json`.

Si hay archivos, mostralos cortito:
```
Logins guardados:
  • icbc-prod-qaIcbcEstandar (último update: hace 3 días)
  • demoblaze-qaDemoblaze    (último update: hace 1 hora)
```

## 2. Qué hacer

`vscode/askQuestions` single-select: `"¿Qué hacés?"`:
- `➕ Grabar un login nuevo`
- `🔄 Refrescar uno existente` *(solo si hay archivos)*
- `🗑️ Borrar uno existente` *(solo si hay archivos)*
- `🏠 Volver al menú`

### Opción `➕ Grabar nuevo` o `🔄 Refrescar`

#### 2.a. Elegir canal

Leé `data/urls.ts` (export `canales`). `vscode/askQuestions` single-select: `"¿En qué canal?"` con cada canal como opción + `➕ Crear nuevo canal` (igual que en `crear-caso.md`).

#### 2.b. Elegir usuario

Como cada **Test Set** tiene su propio `data/data-{slug}.ts` autocontenido (con sus usuarios adentro), no hay un catálogo central. Para grabar el login reusable necesitás solo el `userKey` (sirve para nombrar el archivo de auth) y opcionalmente las credenciales si querés que el agente las precargue al lanzar el grabador.

Leé los archivos `data/data-*.ts` (si existen) y, **escaneando texto plano**, juntá los usuarios que aparezcan referenciados (cualquier objeto literal con campos `canal`, `user`, `pass`). Filtrá los que matcheen el canal elegido (case-insensitive contra `canal.nombre`).

`vscode/askQuestions` single-select: `"¿Qué usuario?"`:
- Cada usuario detectado, mostrando `{userKey} — {user}` (donde `userKey` es la propiedad del data file que contiene al usuario, ej: `usuarioPrincipal`).
- `➕ Cargar uno a mano (no se persiste en ningún data file)`

Si elige cargar a mano: carrousel pidiendo `userKey` (validá `^[a-zA-Z][a-zA-Z0-9_]*$`), `user`, `pass`. El agente **no** edita ningún data file — el usuario se usa solo para esta grabación de login. Si más tarde querés referenciarlo desde un test, el QA lo agrega al `data-{slug}.ts` correspondiente.

> Esta funcionalidad está marcada como **experimental** en el README — el flujo está sujeto a cambios mientras decidimos cómo conviven los logins reusables con los data files autocontenidos.

#### 2.c. Lanzar el grabador con save-storage

Antes de lanzar, mensaje al QA:
```
🔐 Voy a abrir Chrome. Hacé el login completo (incluyendo OTP si aplica)
y, cuando estés del otro lado del login, cerrá el browser.
No hace falta que sigas navegando — yo capturo el estado y listo.
```

Disparalo con `runCommands`:
```
node .autoflow/scripts/record-auth.js "{canalSlug}" "{userKey}" "{urlInicial}"
```

Donde `{canalSlug}` es el slug del canal en kebab-case (`ICBC PROD` → `icbc-prod`). El script imprime al final una línea con prefijo `AUTOFLOW_AUTH:` + JSON.

#### 2.c.1. Confirmar que terminó de loguearse — antes de leer el resultado

Cuando `runCommands` retorna, **NO leas el resultado directo**. Puede retornar antes de que el QA termine el login completo (depende del IDE / setup). Confirmá explícitamente:

`vscode/askQuestions` single-select: `"¿Ya hiciste login completo (incluyendo OTP si aplica) y cerraste el browser?"`:
- `✅ Sí, guardá el storageState`
- `🔁 No, todavía estoy logueándome — esperame`

Si responde `🔁 No`: mostrá un mensaje corto pidiendo que termine de loguearse y cierre el browser, y volvé a abrir el mismo single-select. Repetí hasta que confirme `✅ Sí`. **No avancés mientras la respuesta sea "No"**.

Cuando confirme `✅ Sí`, leé la línea `AUTOFLOW_AUTH:` con `terminalLastCommand`.

- `ok: true` → mostrale al QA: `✅ Listo. Guardé el login en {path}.`
- `ok: false` → mostrá el `error` y abrí `vscode/askQuestions`:
  - `🔄 Reintentar`
  - `🏠 Volver al menú`

#### 2.d. Probar el login (opcional pero recomendado)

`vscode/askQuestions` single-select: `"¿Querés probar que el login quedó bien?"`:
- `🧪 Sí, abrir un browser con el storage cargado`
- `⏭️ No, lo pruebo después`

Si dice sí, generá un spec temporal `tests/_temp/test-auth-{ts}.spec.ts` (la carpeta está excluida del runner via `testIgnore`, pero igual borralo al volver):

```typescript
import { test } from '@playwright/test';

test.use({ storageState: '{authPath}' });

test('verificar login', async ({ page }) => {
  await page.goto('{urlInicial}');
  // Inspect: el QA verifica visualmente que arranco logueado.
  await page.pause();
});
```

**Generá también el config temporal** `tests/_temp/test-auth-{ts}.config.ts`. Sin esto, `npx playwright test` filtra el spec por el `testIgnore: ['**/_temp/**']` global y termina con "0 tests run" (pasarle el path explícito no alcanza):

```typescript
import baseConfig from '../../playwright.config';
export default { ...baseConfig, testIgnore: [] };
```

Correlo con `runCommands` — **siempre con `--config` apuntando al temporal**:
```
npx playwright test --headed --project=chromium tests/_temp/test-auth-{ts}.spec.ts --config tests/_temp/test-auth-{ts}.config.ts
```

Cuando el QA cierra, **borrá spec + config temporales sí o sí**. Single-select de cierre:
- `✅ Funcionó`
- `❌ No anduvo, regrabar` → vuelve a 2.c.

### Opción `🗑️ Borrar`

`vscode/askQuestions` single-select con la lista. Confirmá con un segundo single-select antes de borrar (`✅ Sí, borrar` / `❌ Cancelar`).

## 3. Cierre

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `➕ Grabar otro login`
- `🏠 Volver al menú`
