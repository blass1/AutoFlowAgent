---
mode: agent
description: Lista los Tests que nunca pasaron una corrida real (smoke OK pendiente) y los corre en headed para validación visual. Útil cuando el ambiente estuvo roto durante el smoke inicial y querés ponerte al día con los pendientes.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Validar Tests sin smoke OK

Sub-flow invocado desde el menú principal → `🛠️ Mantenimiento → 🚀 Validar Tests sin smoke OK`. Corre en headed los Tests que están "construidos pero no validados contra browser real" — el caso típico es: grabaste un Test, el ambiente estaba roto, el smoke inicial no se pudo correr o falló por algo no relacionado al Test, y ahora querés ponerte al día.

Shape de los campos de smoke en `session.json` → ver `.autoflow/README.md` sección **Estado de smoke validation**.

## 1. Recolectar pendientes

1. Listá `.autoflow/recordings/*-session.json`.
2. Para cada uno, leé `{ numero, nombre, smokeOk, smokeOkAt, lastRunResult, lastRunAt, testSet?: { slug, id, nombre }, fechaInicio }`.
3. Filtrá los que tengan **`smokeOk !== true`** (es decir: `null`, `false`, o ausente). Esos son los pendientes.
4. Para cada pendiente, calculá:
   - **`motivo`**:
     - `🆕 Nunca corrió` si `lastRunResult === null` o ausente.
     - `⚠️ Falló la última vez` si `lastRunResult === 'failed'`.
     - `❓ Estado raro` si no encaja en ninguna (defensivo).
   - **`specPath`**: del `testSet.slug` resolvé `tests/{testSet.slug}-{testSet.id}.spec.ts`. Si no hay `testSet`, asumí que es un Test suelto y buscá el spec por el `numero` en `tests/*.spec.ts` (greppeando `[testId:{numero}]`).
   - **`antigüedad`**: días desde `fechaInicio` (humanizado: `hoy`, `ayer`, `hace 3 días`, etc.).

## 2. Mostrar la lista al QA

Si no hay pendientes, decile y volvé al menú:

```
✅ Todos los Tests del proyecto pasaron al menos una corrida real (smokeOk: true). No hay nada que validar.
```

Si hay pendientes, mostralos agrupados por motivo en orden: primero los nunca-corridos, después los fallaron-última-vez:

```
🚀 Encontré {N} Test(s) sin smoke OK:

  🆕 Nunca corrió ({n1})
    • [testId:43213] Compra de dolar mep con CA — demoblazeCompras (hace 2 días)
    • [testId:43214] Compra de dolar mep con CC — demoblazeCompras (hoy)

  ⚠️ Falló la última vez ({n2})
    • [testId:43215] Login con OTP — login (hace 5 días, falló en CI por timeout)
```

Si hay `❓ Estado raro` (improbable), mostralo como sección aparte.

## 3. Elegir cuáles correr

`vscode/askQuestions` multi-select: `"¿Cuáles validamos ahora? (corren en headed para que veas el browser)"` con una opción por Test pendiente. Cada label incluye `[testId:{numero}]` + nombre + motivo corto.

Sumá al final:
- `✅ Todos los Nunca-corridos` (preset que tilda solo los 🆕)
- `✅ Todos` (preset que tilda todos)
- `❌ Cancelar` (volvé al menú)

Si el QA confirma vacío (no tildó nada), tratá como cancelar.

## 4. Correr secuencial en headed

> **Por qué secuencial y headed**: el caso de uso es validación visual. Si el QA quería paralelo / headless, hubiera ido a `Ejecutar Test-Set`. Acá el valor agregado es ver el browser.

Por cada Test elegido, en orden:

1. Mostrale al QA: `▶️ Corriendo [{i}/{N}]: [testId:{numero}] {nombre}...` (con número de orden + total).
2. Ejecutá con `runCommands`:
   ```
   node .autoflow/scripts/run-test.js {specPath} --headed --grep=\[testId:{numero}\]
   ```
3. Leé el output con `terminalLastCommand` y extraé la línea `AUTOFLOW_RESULT: { ... }`.
4. **Actualizá `session.json`** del Test con la misma política que `correr-caso.md` paso 3.5:
   - `lastRunResult: status` + `lastRunAt: <ISO ahora>` siempre.
   - Si `passed`: promover `smokeOk: true` + `smokeOkAt: <ISO ahora>` (si no era ya `true`).
   - Si `failed`: no tocar `smokeOk` ni `smokeOkAt`.
5. Anotá el resultado en un array interno `resultados: [{ numero, nombre, status, duration }]` que vas a usar en el paso 5.

## 5. Reportar resumen

Mostrale al QA un resumen consolidado:

```
🚀 Validación terminada: {N} Test(s) corridos.

  ✅ Pasaron ({nPass}):
    • [testId:43213] Compra de dolar mep con CA (3.2s)
    • [testId:43214] Compra de dolar mep con CC (2.8s)

  ❌ Fallaron ({nFail}):
    • [testId:43215] Login con OTP (timeout en clickear "Enviar OTP")
```

Si nadie falló, omití la sección `❌ Fallaron`.

`vscode/askQuestions` single-select: `"¿Qué hacemos?"`:

- `🔧 Reparar un Test fallido` *(solo si hubo fallos)* → si hay >1 fallido, single-select para elegir cuál; después cargá `.autoflow/prompts/reparar-tras-fallo.md` con `{ specPath, testId: numero, mode: 'validar-smoke' }`. Al volver, releé este menú.
- `🔄 Re-correr los fallidos` *(solo si hubo fallos)* → volvé al paso 4 con el subset de fallidos.
- `🚀 Validar los pendientes restantes` *(solo si quedaron Tests sin smoke OK que el QA no tildó en el paso 3)* → volvé al paso 1 (recargá la lista — los que acabás de validar ya no aparecen).
- `🏠 Volver al menú`.

## Notas

- **El flow es no-destructivo**: solo lee specs y corre Playwright. Las únicas escrituras son a `session.json` (campos de smoke).
- **Idempotente**: si el QA corre este flow dos veces seguidas y todos los Tests ya pasaron, en el paso 2 ve el mensaje de "✅ todos pasaron al menos una corrida real" y vuelve al menú.
- **No re-corre Tests con `smokeOk: true`** — esos ya fueron validados alguna vez. Si el QA quiere re-validar uno específico (porque el front cambió), usa `▶️ Ejecutar un Test (Individual)` del menú principal.
- **Detección de Test set vs Test suelto**: prioridad al campo `testSet` del `session.json`. Si está, resolvés el spec por `{slug}-{id}.spec.ts`. Si no está, fallback a grep de `[testId:{numero}]` en `tests/*.spec.ts`. Si no encontrás el spec en ningún lado, avisá al QA y skippeá ese Test (mostralo en el resumen como `⚠️ no se encontró el spec`).
