---
mode: agent
description: Audita las trazas (path.json) de todos los Tests grabados. Regenera las que falten cuando hay inputs disponibles (parsed.json + grupos.json) y reporta las irrecuperables.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Validar / Regenerar trazas

Sub-flow para sanear el estado de las trazas. Útil cuando:
- El dashboard muestra "sin traza" para varios Tests.
- `exportar-alm` falla con `❌ No encuentro la traza`.
- Querés un audit del estado del proyecto antes de un demo.

## 1. Avisar al QA y correr el audit

Mostrale un mensaje breve:
```
🧬 Voy a auditar las trazas de todos los Tests grabados.
   Las trazas (`{numero}-path.json`) son la fuente de verdad para el dashboard,
   exportar a ALM, cobertura y Auto-Health Node. Si alguna falta, intento
   regenerarla con los inputs que haya.
```

Disparalo con `runCommands`:
```
node .autoflow/scripts/validar-trazas.js
```

El script imprime al final una línea con prefijo `AUTOFLOW_VALIDAR_TRAZAS:` + JSON con cuatro arrays:
- `ok`: trazas que ya existían y están bien.
- `regenerado`: trazas que faltaban pero se regeneraron exitosamente desde los inputs.
- `fallido`: trazas que tenían inputs pero `generar-traza.js` falló al armarlas (ver `razon`).
- `irrecuperable`: trazas sin inputs disponibles — la única salida es regrabar el caso.

Leé esa línea con `terminalLastCommand`.

## 2. Reportar al QA

Construí un resumen claro:

```
📊 Audit de trazas:

  ✅ {ok.length} Tests con traza OK
  🔄 {regenerado.length} Tests con traza regenerada en este audit
  ⚠️ {fallido.length} Tests con traza rota (tienen inputs pero generar-traza.js falla)
  ❌ {irrecuperable.length} Tests sin traza ni inputs (hay que regrabar)
```

Si los arrays `regenerado` o `fallido` o `irrecuperable` no están vacíos, mostralos en detalle (uno por línea):
```
🔄 Regeneradas:
  • [testId:43213] Compra de dolar mep — 12 pasos

⚠️ Fallidas:
  • [testId:43214] Otro caso — paso 5 (click ...) no cae en ningún rango de grupos.json

❌ Irrecuperables:
  • [testId:43215] Caso viejo — falta parsed.json (los temporales se borraron sin generar la traza)
```

## 3. Acciones según el resultado

Si **todo OK** (`fallido` y `irrecuperable` vacíos):
- Mensaje: `✅ Todas las trazas están en orden.`
- `vscode/askQuestions` single-select: `"¿Algo más?"` con `🏠 Volver al menú`.

Si hay **fallidas** (con inputs pero el script no pudo armar la traza):
- Por lo general son inconsistencias entre `nodos.json` y los grupos (un nodo apunta a un id que ya no existe). Mostrale al QA la `razon` de cada uno.
- Single-select: `"¿Qué hacés con los fallidos?"`:
  - `🧩 Reparar Nodos sospechosos` → cargá `actualizar-nodos.md` (probablemente hay deprecated sin reemplazo).
  - `🏠 Volver al menú` (los volvés a ver la próxima vez que corras el audit).

Si hay **irrecuperables**:
- Mensaje: `Estos Tests perdieron sus inputs y no se pueden regenerar automáticamente. Hay que regrabarlos con la opción "✨ Crear un Test" o eliminar las sesiones huérfanas.`
- `vscode/askQuestions` single-select: `"¿Qué hacés?"`:
  - `🗑️ Borrar las sesiones irrecuperables` → para cada uno, borrá `.autoflow/recordings/{numero}-session.json`. NO borres el spec ni el data file — el código sigue siendo válido aunque la traza se haya perdido.
  - `↩️ Dejarlos como están` → no toca nada.
  - `🏠 Volver al menú`

## Notas

- **El script es idempotente**: correrlo varias veces no rompe nada. Las trazas OK las deja en paz, regenera solo las que falten.
- **El script soporta `--solo-audit`**: si querés ver el estado sin que intente regenerar, corré `node .autoflow/scripts/validar-trazas.js --solo-audit` a mano.
- **Cuándo correr este flujo**: después de un `clearSession` parcial, después de un git pull que trajo recordings nuevos sin sus path.json, o cuando el dashboard te muestra "sin traza" en varios Tests.
