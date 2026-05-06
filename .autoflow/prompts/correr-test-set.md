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
- `▶️ Sí, dale`
- `❌ Cancelar`

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

Dispará la VSCode task **`autoflow:run-testset-headed`** con el `slug`. La task corre `node .autoflow/scripts/run-testset.js <slug> --headed` que arma `npx playwright test <specPath> --reporter=line --headed --workers=1` con navegador visible (el QA quiere ver la corrida).

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
- `▶️ Correr solo los que fallaron` → corré con `runCommands` el comando `npx playwright test {specPath} --reporter=line,html --trace=retain-on-failure --headed --workers=1 --grep "\\[testId:{n1}\\]|\\[testId:{n2}\\]|..."` armando el grep con los testId que fallaron.
- `🧩 Actualizar **Nodos** sospechosos de un **Test**` → si hay más de un **Test** fallado, abrí `vscode/askQuestions` single-select primero para elegir cuál reparar. Después cargá `.autoflow/prompts/actualizar-nodos.md` con el contexto `{ specPath, numeroTC: <elegido> }`. Al volver, releé este menú.
- `📊 Abrir el reporte HTML de Playwright` → ejecutá con `runCommands`: `npx playwright show-report`. El reporte tiene traces, screenshots y stack de cada **Test** fallido. Al volver, releé este menú.
- `🔍 Ver el primer error en detalle`
- `🚀 Correr otro **Test Set**`
- `🏠 Volver al menú`
