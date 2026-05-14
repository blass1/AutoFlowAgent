---
mode: agent
description: Configura qué Tests y Test Sets reflejan sus ejecuciones en ALM via la integración binaria. Mantiene .autoflow/alm/tracking.json con master switch + override por Test y por Test Set.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Configuración de ejecuciones en ALM

Sub-flow invocado desde `menu-principal.md → 🛠️ Configuración y Mantenimiento → 🔗 Configuración de ejecuciones en ALM`. Permite al QA elegir qué runs se reflejan en ALM cuando se ejecutan los Tests, con master switch global + override por Test y por Test Set.

Mecánica del push: la documenta `.autoflow/scripts/lib/alm-push.js` y vive afuera de este prompt. Este sub-flow solo edita preferencias.

## Estado: `.autoflow/alm/tracking.json`

Shape canónico:

```json
{
  "master": "on",
  "tests": { "99001": "on", "99002": "off" },
  "testsets": { "demoblazeCompras": "on" }
}
```

- **`master`**: `'on' | 'off'`. Interruptor global. Si está `'off'`, no se pushea nada al ALM aunque haya overrides en `'on'`. Útil cuando el QA está haciendo modificaciones y no quiere ensuciar ALM con runs experimentales.
- **`tests[testId]`**: override por Test puntual (`'on' | 'off'`). Default ausente = no se pushea (opt-in explícito).
- **`testsets[slug]`**: override por Test Set entero (`'on' | 'off'`). Si está `'on'`, todos los Tests del set se pushean, salvo que tengan un override individual en `'off'`.

**Regla de evaluación** (la usa `alm-push.js` post-run): un Test se pushea si:
```
master === 'on'
  AND (tests[testId] === 'on'
       OR (tests[testId] !== 'off' AND testsets[testSet.slug] === 'on'))
```

Es decir: el override por Test gana sobre el del Test Set. Sin override explícito, hereda del Test Set; si tampoco hay override del Set, no se pushea.

## 1. Cargar estado actual

1. Leé `.autoflow/alm/tracking.json`. Si no existe, asumí default: `{ master: 'off', tests: {}, testsets: {} }`.
2. Listá todos los Tests del proyecto: recorré `.autoflow/recordings/*-session.json` y armá `{ numero, nombre, testSet?: { slug, id, nombre } }` por cada uno.
3. Listá todos los Test Sets: leé `.autoflow/testsets/*.json` y armá `{ slug, id, nombre, casos: [...] }`.

## 2. Mostrar estado y menú principal

Mostrale al QA un resumen compacto:

```
🔗 Configuración de ejecuciones en ALM

   Master switch:     🟢 ON   (los runs se reflejan en ALM)
   Tests tracked:     3 ON / 1 OFF (de 5 totales — el resto sigue al Test Set)
   Test Sets tracked: 2 ON / 0 OFF (de 4 totales)
   Integración:       ✅ ALM_Updater_v2.2.0.exe presente en .autoflow/alm/integrations/
```

Calculá las líneas dinámicamente:
- **Master**: 🟢 ON / 🔴 OFF según `tracking.master`.
- **Tests / Test Sets**: contar overrides `'on'` y `'off'` en cada bucket.
- **Integración**: chequear que exista `.autoflow/alm/integrations/ALM_Updater_v2.2.0.exe`. Si no, `⚠️ Falta ALM_Updater_v2.2.0.exe en .autoflow/alm/integrations/ — la integración no puede correr aunque master esté ON. Pedile el binario al admin del repo.`

`vscode/askQuestions` single-select: `"¿Qué hacés?"`:

- `🌐 Cambiar Master switch (ON ↔ OFF)`
- `✏️ Activar/desactivar tracking por Test`
- `✏️ Activar/desactivar tracking por Test Set`
- `📋 Ver estado completo por Test`
- `🏠 Volver al menú`

## 3. Ramas

### Rama `🌐 Cambiar Master switch`

`vscode/askQuestions` single-select: `"Master switch actual: {🟢 ON | 🔴 OFF}. ¿Cambiar?"`:
- `🔄 Sí, alternar` → `tracking.master = (master === 'on' ? 'off' : 'on')`. Guardá. Confirmá: `Master switch ahora: {nuevoEstado}`.
- `❌ Cancelar` → volvé al paso 2 sin tocar nada.

### Rama `✏️ Activar/desactivar tracking por Test`

1. Listá todos los Tests con su estado actual computado:
   ```
   🟢 [testId:99001] Compra Samsung Galaxy S6 (demoblazeCompras) — override: ON
   ⚪ [testId:99002] Compra iPhone X (demoblazeCompras) — heredado del Set (ON)
   ⚪ [testId:99003] Login con OTP (auth) — sin override (Set también sin override → no se pushea)
   🔴 [testId:99004] Renovar plazo fijo (inversiones) — override: OFF
   ```
   - 🟢 = override `'on'`
   - 🔴 = override `'off'`
   - ⚪ = sin override (hereda del Set)
2. `vscode/askQuestions` **multi-select**: `"Marcá los Tests que querés ACTIVAR para tracking en ALM:"` con cada uno como opción. Los que ya estén en `'on'` aparecen pre-tildados.
3. Cuando confirma, comparás el estado pre/post:
   - Tests que pasaron de no-tildado a tildado → setear `tracking.tests[testId] = 'on'`.
   - Tests que pasaron de tildado a no-tildado → **single-select intermedio** por cada uno: `"¿{nombre} lo querés en OFF explícito (no pushear nunca aunque el Set esté ON) o quitarle el override (que herede del Set)?"`:
     - `🔴 OFF explícito` → `tracking.tests[testId] = 'off'`.
     - `⚪ Quitar override` → `delete tracking.tests[testId]`.
4. Guardá `tracking.json`. Confirmale al QA con un diff corto: `Updated: 3 → ON, 1 → OFF, 0 → sin override.` Volvé al paso 2.

### Rama `✏️ Activar/desactivar tracking por Test Set`

Igual que la rama de Tests pero sobre `.autoflow/testsets/*.json`. Los labels muestran cuántos Tests tiene el Set:

```
🟢 demoblazeCompras (5 Tests) — override: ON
⚪ auth (2 Tests) — sin override (no se pushea)
🔴 inversiones (8 Tests) — override: OFF (bloquea hasta overrides individuales)
```

Lógica de "quitar override" idéntica a la rama de Tests.

### Rama `📋 Ver estado completo por Test`

Mostrale al QA una tabla legible (no editable, solo info):

```
Test                                       Set                    Estado final     Por qué
─────────────────────────────────────────  ─────────────────────  ───────────────  ─────────────────────
[testId:99001] Compra Samsung Galaxy S6    demoblazeCompras       🟢 Se pushea     override Test: ON
[testId:99002] Compra iPhone X             demoblazeCompras       🟢 Se pushea     hereda Set: ON
[testId:99003] Login con OTP               auth                   ⚪ No se pushea   sin override, Set sin override
[testId:99004] Renovar plazo fijo          inversiones            🔴 No se pushea   override Test: OFF
[testId:99005] Comprar bonos               inversiones            🔴 No se pushea   hereda Set: OFF
```

Si master es OFF, agregá una nota arriba: `⚠️ Master switch OFF — nada se pushea actualmente, sin importar los overrides.`

`vscode/askQuestions` single-select: `↩️ Volver` → al paso 2.

## 4. Cierre

Cuando el QA elige `🏠 Volver al menú` en el paso 2, volvé al menú principal (sub-menú de Configuración y Mantenimiento).

## Reglas

- **Idempotente**: tocar el mismo Test/Set dos veces seguidas con el mismo valor no rompe nada.
- **Atómico**: cuando guardás `tracking.json`, escribilo entero (no merges parciales). Backup en memoria del estado previo por si el QA cancela.
- **No correr el .exe ni nada relacionado**. Este sub-flow es 100% sobre preferencias declarativas. El push real lo hace `alm-push.js` después de cada corrida via los wrappers — copia el `ALM_Updater_v2.2.0.exe` desde `.autoflow/alm/integrations/` al folder del run, lo ejecuta, lee el `ALM_Updater_Log_*.txt` que deja, y reporta al QA por consola si quedó OK.
- **Convención de estado**: usá los string `'on'` y `'off'` (lowercase, sin booleans) — alineado con el formato de `smokeOk` y demás campos del proyecto. `true/false` invitaría a `JSON.parse` ambiguo en otros consumers.
