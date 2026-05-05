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

Leé `.autoflow/urls/urls.json`. `vscode/askQuestions` single-select: `"¿En qué canal?"` con cada canal como opción + `➕ Crear nuevo canal` (igual que en `crear-caso.md`).

#### 2.b. Elegir usuario

Leé `data/usuarios.ts` y extraé las keys disponibles. Filtrá los que tengan `canal` igual al elegido (igualdad case-insensitive contra `canal.nombre`).

`vscode/askQuestions` single-select: `"¿Qué usuario?"`:
- Cada `userKey` que matchea, mostrando `{userKey} — {user}`.
- `➕ Agregar uno nuevo a usuarios.ts`

Si elige agregar nuevo: carrousel pidiendo `userKey` (validá `^[a-zA-Z][a-zA-Z0-9_]*$`), `user`, `pass`, `dni?`. Editá `data/usuarios.ts` agregando la entrada **antes** de seguir. Confirmá con el QA que es un usuario de homologación (la pass queda en el repo).

#### 2.c. Lanzar codegen con save-storage

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

Donde `{canalSlug}` es el slug del canal en kebab-case (`ICBC PROD` → `icbc-prod`). El script imprime al final una línea con prefijo `AUTOFLOW_AUTH:` + JSON. Leela con `terminalLastCommand`.

- `ok: true` → mostrale al QA: `✅ Listo. Guardé el login en {path}.`
- `ok: false` → mostrá el `error` y abrí `vscode/askQuestions`:
  - `🔄 Reintentar`
  - `🏠 Volver al menú`

#### 2.d. Probar el login (opcional pero recomendado)

`vscode/askQuestions` single-select: `"¿Querés probar que el login quedó bien?"`:
- `🧪 Sí, abrir un browser con el storage cargado`
- `⏭️ No, lo pruebo después`

Si dice sí, generá un spec temporal `.autoflow/recordings/_test-auth-{ts}.spec.ts`:

```typescript
import { test } from '@playwright/test';

test.use({ storageState: '{authPath}' });

test('verificar login', async ({ page }) => {
  await page.goto('{urlInicial}');
  // Inspect: el QA verifica visualmente que arranco logueado.
  await page.pause();
});
```

Correlo con `runCommands`:
```
npx playwright test --headed --project=chromium .autoflow/recordings/_test-auth-{ts}.spec.ts
```

Cuando el QA cierra, **borrá el spec temporal sí o sí**. Single-select de cierre:
- `✅ Funcionó`
- `❌ No anduvo, regrabar` → vuelve a 2.c.

### Opción `🗑️ Borrar`

`vscode/askQuestions` single-select con la lista. Confirmá con un segundo single-select antes de borrar (`✅ Sí, borrar` / `❌ Cancelar`).

## 3. Cierre

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `➕ Grabar otro login`
- `🏠 Volver al menú`
