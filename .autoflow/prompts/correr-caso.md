---
mode: agent
description: Corre un caso de prueba puntual y reporta el resultado.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Correr caso

## 1. Selección

Mismo flujo que `editar-caso.md` pasos 1-2: dos `vscode/askQuestions` single-select para elegir test set y luego caso. Anotá el `specPath` del test set (`tests/{slug}-{id}.spec.ts`) y el `numero` del caso (TC-XXXX).

> **Importante**: el spec contiene **todos** los TC del test set, uno por bloque `test('TC-{numero} ...', ...)`. Para correr solo el caso elegido necesitás filtrar con `--grep "TC-{numero}"`. No pases solo el path del spec a Playwright o vas a correr los demás casos también.

## 2. Confirmar

Usá `vscode/askQuestions` single-select: `"¿Corro TC-{numero} en {specPath}?"` con:
- `▶️ Sí, dale`
- `❌ Cancelar`

## 3. Ejecutar

Ejecutá con `runCommands` el comando:

```
node .autoflow/scripts/run-test.js {specPath} --headed --grep "TC-{numero}"
```

El script corre `npx playwright test {specPath} --reporter=line --headed --workers=1 --grep "TC-{numero}"` (navegador visible + filtro al TC elegido) e imprime al final:

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
