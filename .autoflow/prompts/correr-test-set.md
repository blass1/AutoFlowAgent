---
mode: agent
description: Corre todos los casos de un test set y reporta el resumen.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Correr test set

## 1. Elegir set

Listá `.autoflow/testsets/*.json`. Si no hay ninguno, decile y volvé al menú.

Usá `#tool:vscode/askQuestions` single-select: `"¿Cuál corremos?"`:
- `🚀 Mobile Banking - Login (3 casos)`
- `🚀 Home Banking - Transferencias (5 casos)`
- ...

## 2. Confirmar

Usá `vscode/askQuestions` single-select: `"¿Corro \"{nombre}\" con {N} casos?"`:
- `🎬 Headed (ver el browser, secuencial — recomendado para validar visualmente)`
- `⚡ Headless (rápido, paralelo — recomendado para regresiones de muchos Tests)`
- `❌ Cancelar`

Anotá el modo elegido. En el paso 3, si elige `Headless`, dispará el script **sin** `--headed` (Playwright usa los workers default del config); si elige `Headed`, sumá `--headed` (que internamente fuerza `--workers=1`).

## 2.5. Validar coherencia antes de correr

Ejecutá con `runCommands`:
```
node .autoflow/scripts/validar-coherencia.js {slug}
```

Leé la última línea con `terminalLastCommand`. Tiene el prefijo `AUTOFLOW_VALIDACION:` seguido de un JSON `{ ok, errores, warnings }`.

- **`ok: true`**: si hay `warnings`, mostralos breve y seguí. Si no, pasá silencioso al paso 3.
- **`ok: false`**: mostrale al QA los `errores` (lista corta) y abrí `vscode/askQuestions` single-select:
  - `🔧 Reparar a mano y reintentar` → volvé al paso 1.
  - `▶️ Correr igual (puede fallar feo)` → seguí al paso 3 con la advertencia incluida.
  - `🏠 Volver al menú`

## 3. Ejecutar

Según el modo elegido en el paso 2:
- **Headed** → dispará la VSCode task **`autoflow:run-testset-headed`** con el `slug`. La task corre `node .autoflow/scripts/run-testset.js <slug> --headed` (`--reporter=line`, `--headed`, `--workers=1`).
- **Headless** → ejecutá con `runCommands`: `node .autoflow/scripts/run-testset.js <slug>` (sin `--headed`; Playwright paraleliza con los workers del config).

Al final, el script imprime:
```
AUTOFLOW_RESULT: { "total": N, "status": "passed|failed", "exitCode": <n>, "duration": <ms>, "set": "...", "casos": [...], "motivos"?: [{ "testId": "...", "motivo": { "id": "...", "label": "..." } }] }
```

`motivos[]` solo aparece cuando `status: failed`. Trae una entrada por cada Test que falló, con el motivo clasificado (cruza la evidencia que la fixture `errorCapture` dejó en `{artifactsDir}/failures/{testId}.json` contra el catálogo `.autoflow/conventions/error-patterns.json`). Si ningún pattern matchea, el `motivo.id` es `no-clasificado`.

Leé esa línea con `terminalLastCommand`.

## 3.5. Persistir estado de smoke por Test

El `casos[]` del `AUTOFLOW_RESULT` trae el resultado por **Test** del set (cada item: `{ testId, status: 'passed' | 'failed', duration }`). Por cada item, actualizá `.autoflow/recordings/{testId}-session.json` (shape en "Estado de smoke validation" de `.autoflow/README.md`):

- **Siempre**: `lastRunResult: status` + `lastRunAt: <ISO ahora>`.
- **Si `status === 'passed'` y `smokeOk` era `null` / `false`**: setear `smokeOk: true` + `smokeOkAt: <ISO ahora>` (promoción a smoke OK).
- **Si `status === 'passed'` y `smokeOk` ya era `true`**: no toques `smokeOk` ni `smokeOkAt` (mantenemos el timestamp histórico del primer pass).
- **Si `status === 'failed'`**: **no toques** `smokeOk` ni `smokeOkAt`. El Test sigue siendo "construido OK" si pasó alguna vez — `lastRunResult: 'failed'` ya refleja el estado actual.

Si algún `session.json` no existe, creá uno mínimo con esos 4 campos (más `numero`).

Hacelo callado — no le anuncies al QA cada update. La info se ve después en el flow "🚀 Validar Tests sin smoke OK".

## 4. Reportar

Mostrá:
```
🚀 "{nombre}" terminó.

  Total:    {total}
  Estado:   {✅ pasaron todos | ❌ algunos fallaron}
  Duración: {duration}ms
```

### Si pasaron todos

Abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🚀 Correr otro test set`
- `🏠 Volver al menú`

### Si fallaron

Parseá las líneas previas del reporter `line` para identificar qué `test()` dentro del spec fallaron y mostralos por su nombre completo (`{nombre} [testId:{numero}]`). Para cada Test fallado, buscá su entrada en `motivos[]` (matcheando `testId`) y agregá una línea indentada con `motivo.label` debajo:
```
**Tests** que fallaron:
  • Compra de dolar mep con CA [testId:43213]
    Motivo probable: Microservicio orders respondió 503
  • Compra de dolar mep con CC [testId:43214]
    Motivo probable: Credenciales o datos incorrectos
```
Si un test fallado no tiene entry en `motivos[]` (raro — significa que la fixture no escribió failure.json), omití la línea de motivo en lugar de mostrar `—`.

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🔧 Reparar un **Test** fallido` → si hay más de un **Test** fallado, abrí `vscode/askQuestions` single-select primero para elegir cuál reparar. Después cargá `.autoflow/prompts/reparar-tras-fallo.md` con `{ specPath, testId: <elegido>, mode: 'run-testset' }`. Ese sub-flow parsea el output del Playwright, identifica el **Nodo** que rompió y ofrece reparación surgical (Auto-Health o pegado a mano sobre ese **Nodo**). Si no logra identificarlo, cae al multi-select adivinatorio de `actualizar-nodos.md`. Al volver, releé este menú (con la lista de **Tests** fallados actualizada).
- `▶️ Correr solo los que fallaron` → corré con `runCommands` el comando `npx playwright test {specPath} --reporter=line,html --trace=retain-on-failure --headed --workers=1 --grep=\[testId:{n1}\]|\[testId:{n2}\]|...` armando el grep con los testId que fallaron. **Forma `--grep=value`** sin quotes y sin doble backslash — evita el bug de PowerShell escapando mal los corchetes.
- `📊 Re-correr con trace y abrir reporte HTML` → la corrida default usa `--reporter=line` (rápido, sin overhead). Para investigar un fallo necesitás trace + reporte HTML, así que volvé a correr con `--debug`: `node .autoflow/scripts/run-testset.js {slug} --headed --debug`. Cuando termine, abrí el reporte: `npx playwright show-report`. Al volver, releé este menú.
- `🔍 Ver el primer error en detalle`
- `🚀 Correr otro **Test Set**`
- `🏠 Volver al menú`
