---
mode: agent
description: Corre un caso de prueba puntual y reporta el resultado.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Correr caso

## 1. Selección

Mismo flujo que `editar-caso.md` pasos 1-2: dos `vscode/askQuestions` single-select para elegir test set y luego caso.

## 2. Confirmar

Usá `vscode/askQuestions` single-select: `"¿Corro tests/{archivo}?"` con:
- `▶️ Sí, dale`
- `❌ Cancelar`

## 3. Ejecutar

Dispará la VSCode task **`autoflow:run-test`** con el path del archivo. La task corre `node scripts/run-test.js <archivo>` que ejecuta `npx playwright test <archivo> --reporter=line` headless e imprime al final:

```
AUTOFLOW_RESULT: { "status": "passed|failed", "duration": <ms>, "exitCode": <n>, "archivo": "..." }
```

Leé esa línea con `terminalLastCommand`.

## 4. Reportar

### Si `status: passed`

Mostrá:
> `✅ TC-{numero} pasó (duración: {duration}ms)`

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `▶️ Correr otro caso`
- `🔄 Volver a correr este`
- `🏠 Volver al menú`

### Si `status: failed`

Mostrá:
> `❌ TC-{numero} falló (exit code: {exitCode})`

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🔍 Ver el error completo`
- `📝 Abrir el test para editar`
- `🔄 Volver a correr`
- `🏠 Volver al menú`

Si el QA elige `🔍 Ver el error completo`, releé el output del terminal y mostrá las líneas relevantes (excepción, stack trace).
