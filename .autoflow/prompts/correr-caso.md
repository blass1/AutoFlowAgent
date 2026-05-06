---
mode: agent
description: Corre un Test puntual y reporta el resultado.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Correr Test

## 1. Selección

Mismo flujo que `editar-caso.md` pasos 1-2: dos `vscode/askQuestions` single-select para elegir **Test Set** y luego **Test**. Anotá el `specPath` del **Test Set** (`tests/{slug}-{id}.spec.ts`) y el `numero` del **Test** (testId).

> **Importante**: el spec contiene **todos** los **Tests** del **Test Set** dentro de un único `test.describe`, cada uno con nombre `"{nombre} [testId:{numero}]"`. Para correr solo el **Test** elegido filtrá con `--grep "\\[testId:{numero}\\]"`. No pases solo el path del spec a Playwright o vas a correr los demás **Tests** del set también.

## 2. Confirmar

Usá `vscode/askQuestions` single-select: `"¿Corro el **Test** [testId:{numero}] en {specPath}?"` con:
- `▶️ Sí, dale`
- `❌ Cancelar`

## 3. Ejecutar

Ejecutá con `runCommands` el comando:

```
node .autoflow/scripts/run-test.js {specPath} --headed --grep "\\[testId:{numero}\\]"
```

El script corre `npx playwright test {specPath} --reporter=line --headed --workers=1 --grep "\\[testId:{numero}\\]"` (navegador visible + filtro al testId elegido) e imprime al final:

```
AUTOFLOW_RESULT: { "status": "passed|failed", "duration": <ms>, "exitCode": <n>, "archivo": "..." }
```

Leé esa línea con `terminalLastCommand`.

## 4. Reportar

### Si `status: passed`

Mostrá:
> `✅ **Test** [testId:{numero}] pasó (duración: {duration}ms)`

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `▶️ Correr otro **Test**`
- `🔄 Volver a correr este`
- `🏠 Volver al menú`

### Si `status: failed`

Mostrá:
> `❌ **Test** [testId:{numero}] falló (exit code: {exitCode})`

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🔄 Volver a correr`
- `🧩 Actualizar **Nodos** sospechosos` → cargá `.autoflow/prompts/actualizar-nodos.md` con el contexto `{ specPath, numeroTC: numero }`. Al volver, releé este menú.
- `📊 Abrir el reporte HTML de Playwright` → ejecutá con `runCommands`: `npx playwright show-report`. Abre el HTML con trace, screenshots y stack del fallo. Al volver, releé este menú.
- `🔍 Ver el error completo` → releé el output con `terminalLastCommand` y mostrá las líneas relevantes (excepción, stack trace).
- `📝 Abrir el **Test** para editar`
- `🏠 Volver al menú`
