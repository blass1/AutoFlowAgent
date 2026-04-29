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

Parseá las líneas previas del reporter `line` para identificar qué `test()` dentro del spec fallaron y mostralos por su nombre (`TC-{numero} {nombre}`):
```
Casos que fallaron:
  • TC-4521 Login con OTP
  • TC-4530 Transferencia entre cuentas propias
```

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🔍 Ver el primer error en detalle`
- `▶️ Correr solo los que fallaron` → corré con `runCommands` el comando `npx playwright test {specPath} --reporter=line --headed --workers=1 --grep "<TC-numero1>|<TC-numero2>|..."` armando el grep con los TC que fallaron.
- `🚀 Correr otro test set`
- `🏠 Volver al menú`
