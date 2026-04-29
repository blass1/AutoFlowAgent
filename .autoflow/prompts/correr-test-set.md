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

Dispará la VSCode task **`autoflow:run-testset`** con el `slug`. La task corre `node scripts/run-testset.js <slug>` que arma `npx playwright test <caso1> <caso2> ... --reporter=line` headless.

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

Parseá las líneas previas del reporter `line` para identificar qué casos fallaron y mostralos:
```
Casos que fallaron:
  • tests/tc-4521-login-otp.spec.ts
  • tests/tc-4530-transferencia.spec.ts
```

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🔍 Ver el primer error en detalle`
- `▶️ Correr solo los que fallaron`
- `🚀 Correr otro test set`
- `🏠 Volver al menú`
