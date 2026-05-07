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
AUTOFLOW_RESULT: { "total": N, "status": "passed|failed", "exitCode": <n>, "duration": <ms>, "set": "...", "casos": [...] }
```

Leé esa línea con `terminalLastCommand`.

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

Parseá las líneas previas del reporter `line` para identificar qué `test()` dentro del spec fallaron y mostralos por su nombre completo (`{nombre} [testId:{numero}]`):
```
**Tests** que fallaron:
  • Compra de dolar mep con CA [testId:43213]
  • Compra de dolar mep con CC [testId:43214]
```

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `▶️ Correr solo los que fallaron` → corré con `runCommands` el comando `npx playwright test {specPath} --reporter=line,html --trace=retain-on-failure --headed --workers=1 --grep=\[testId:{n1}\]|\[testId:{n2}\]|...` armando el grep con los testId que fallaron. **Forma `--grep=value`** sin quotes y sin doble backslash — evita el bug de PowerShell escapando mal los corchetes.
- `🧩 Actualizar **Nodos** sospechosos de un **Test**` → si hay más de un **Test** fallado, abrí `vscode/askQuestions` single-select primero para elegir cuál reparar. Después cargá `.autoflow/prompts/actualizar-nodos.md` con el contexto `{ specPath, numeroTC: <elegido> }`. Al volver, releé este menú.
- `📊 Re-correr con trace y abrir reporte HTML` → la corrida default usa `--reporter=line` (rápido, sin overhead). Para investigar un fallo necesitás trace + reporte HTML, así que volvé a correr con `--debug`: `node .autoflow/scripts/run-testset.js {slug} --headed --debug`. Cuando termine, abrí el reporte: `npx playwright show-report`. Al volver, releé este menú.
- `🔍 Ver el primer error en detalle`
- `🚀 Correr otro **Test Set**`
- `🏠 Volver al menú`
