---
mode: agent
description: Corre un Test puntual y reporta el resultado.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Correr Test

## 1. Selección

Mismo flujo que `editar-caso.md` pasos 1-2: dos `vscode/askQuestions` single-select para elegir **Test Set** y luego **Test**. Anotá el `specPath` del **Test Set** (`tests/{slug}-{id}.spec.ts`) y el `numero` del **Test** (testId).

> **Importante**: el spec contiene **todos** los **Tests** del **Test Set** dentro de un único `test.describe`, cada uno con nombre `"{nombre} [testId:{numero}]"`. Para correr solo el **Test** elegido filtrá con `--grep=\[testId:{numero}\]` (forma `=` sin quotes — evita problemas de escapado de corchetes en PowerShell). No pases solo el path del spec a Playwright o vas a correr los demás **Tests** del set también.

## 2. Confirmar

Usá `vscode/askQuestions` single-select: `"¿Corro el **Test** [testId:{numero}] en {specPath}?"` con:
- `▶️ Sí, dale`
- `❌ Cancelar`

## 3. Ejecutar

Ejecutá con `runCommands` el comando:

```
node .autoflow/scripts/run-test.js {specPath} --headed --grep=\[testId:{numero}\]
```

> **No uses comillas alrededor del valor del grep ni dobles backslashes (`\\[`)** — la forma `--grep=\[...\]` mantiene el valor como un único token y evita el bug de PowerShell escapando mal los corchetes.

El script corre `npx playwright test {specPath} --reporter=line --headed --workers=1 --grep=\[testId:{numero}\]` (navegador visible + filtro al testId elegido) e imprime al final:

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
- `🔧 Reparar el **Test** fallido` → cargá `.autoflow/prompts/reparar-tras-fallo.md` con `{ specPath, testId: numero, mode: 'run-test' }`. Ese sub-flow parsea el output, identifica el **Nodo** que rompió y ofrece reparación surgical (Auto-Health o pegado a mano sobre ese **Nodo**). Si no logra identificarlo, cae al multi-select adivinatorio de `actualizar-nodos.md`. Al volver, releé este menú.
- `🔄 Volver a correr`
- `📊 Re-correr con trace y abrir reporte HTML` → la corrida default usa `--reporter=line` (rápido, sin overhead). Para investigar un fallo necesitás trace + reporte HTML, así que volvé a correr con `--debug`: `node .autoflow/scripts/run-test.js {specPath} --headed --debug --grep=\[testId:{numero}\]`. Cuando termine, abrí el reporte: `npx playwright show-report`. Al volver, releé este menú.
- `🔍 Ver el error completo` → releé el output con `terminalLastCommand` y mostrá las líneas relevantes (excepción, stack trace).
- `📝 Abrir el **Test** para editar`
- `🏠 Volver al menú`
