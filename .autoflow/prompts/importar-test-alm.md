---
mode: agent
description: Importa un Test de ALM por testid usando la integración fetch_test_*.exe y le hace una auditoría básica (steps solapados, cantidad mínima).
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Importar y Analizar Test de ALM

**Opción 1 del sub-menú ALM-HP**. Trae los datos crudos de un Test desde ALM (sin grabar nada nuevo) y le hace una auditoría rápida de calidad.

> **Diferencia con el flujo de Crear Test paso 0.a**: ahí el .exe alimenta una grabación nueva. Acá **solo importás + analizás** sin tocar nada del repo — útil cuando querés inspeccionar el caso de ALM antes de decidir si lo automatizás.

## 1. Chequeo de la integración

**Comando determinístico** vía `runCommands`. **No uses `file_search` / `codebase`** — esos tools no indexan binarios (`.exe`).

```bash
node -e "console.log(require('fs').existsSync('.autoflow/alm/integrations/fetch_test_v1.0.0.exe') ? 'OK' : 'MISSING')"
```

Leé el output con `terminalLastCommand`. Solo seguí el branch de "no existe" si el output contiene literalmente `MISSING`. Cualquier otra cosa tratala como existente.

- `MISSING` → mensaje al QA y volver al menú principal:
  ```
  ⚠️ No tenés instalada la integración con ALM (.autoflow/alm/integrations/fetch_test_v1.0.0.exe).
  Si tu equipo te la pasó, pegala en esa carpeta.
  ```
- `OK` → seguí.

## 2. Pedir el testid

`vscode/askQuestions` text input:
- `"¿Qué Test ID querés importar y analizar? (ej: 668998)"`

Limpiá el input (sin espacios extras).

## 3. Invocar la integración

PowerShell vía `runCommands`:

```powershell
& ".\.autoflow\alm\integrations\fetch_test_v1.0.0.exe" --name {testid}
```

Leé la salida con `terminalLastCommand`. Parseá el JSON con shape:

```json
{
  "success": true,
  "test_id": "668998",
  "step_count": 9,
  "test_name": "Test Prueba",
  "version": "1.0.0",
  "message": "✓ Obtenidos 9 steps del test 668998",
  "steps": [ { "step-order": "1", "name": "...", "description": "...", "expected": "...", ... }, ... ]
}
```

**Manejo de errores** (no bloqueante — el QA puede reintentar):
- Exit code ≠ 0, JSON inválido, o `success: false` → mensaje corto con el error y volvé a abrir la pregunta del paso 2. No reintentes en loop.
- Timeout (>10s) → idem.

## 4. Persistir el JSON crudo

Si `success: true`, guardá copia en:
```
.autoflow/alm/originalTests/{test_id}.json
```
Sobreescribí si ya existía. Es la **misma carpeta** que usa `crear-caso.md` paso 0.a — así un caso recientemente importado puede reusarse sin re-fetchear.

## 5. Análisis (versión inicial — 2 chequeos)

Por ahora la auditoría es simple. Aplicá estos 2 checks sobre el array `steps[]`:

### Check 1 — Cantidad mínima de pasos

Si `step_count < 8`:
```
⚠️ El caso tiene solo {step_count} pasos. Es bastante reducido — los Tests con menos de 8 pasos suelen estar incompletos o ser demasiado superficiales para una regresión completa.
```

### Check 2 — Pasos solapados (múltiples acciones en un mismo Description o Expected)

Por cada step, revisá `description` y `expected`. Un step **solapado** es uno que mete varias acciones o verificaciones en una sola frase, en vez de partirlas en steps separados.

**Patrones a detectar** (heurística — buscá estos en `description` y `expected`):
- Conectores entre verbos imperativos: `" y "`, `" además "`, `" luego "`, `" después "`, `" tras "`, `" y a continuación "`.
- Múltiples verbos imperativos en la misma frase: *"Ingresar... presionar..."*, *"Hacer click... validar..."*.
- Listas inline con comas + `y` final: *"Validar A, B y C"*.
- Múltiples `expected`: *"El sistema valida y redirige"*, *"Aparece el toast y se actualiza la tabla"*.

Por cada step afectado, listá:
```
• Step {N} ({campo: description o expected}): "{texto original}"
  → sugerencia: separá en {acción 1} / {acción 2}
```

Si la heurística no detecta nada con confianza, no marques falsos positivos — mejor pasar de largo.

## 6. Resumen al QA

Mostrale al QA un resumen estructurado:

```
📥 Importé el Test {test_id} ({test_name}) desde ALM.
   • JSON crudo guardado en .autoflow/alm/originalTests/{test_id}.json
   • Pasos: {step_count}

📊 Análisis:
  {bloque Check 1 si step_count < 8, sino omitir}
  {bloque Check 2 si hay steps solapados, sino omitir}
  {si no hay observaciones: "✅ Sin observaciones — los pasos lucen bien estructurados."}
```

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `↩️ Volver al menú principal`

> No hace falta hacer nada con los datos por ahora. La carpeta `.autoflow/alm/originalTests/` actúa como cache local — `crear-caso.md` paso 0.a la puede aprovechar después si el QA decide automatizar este Test.
