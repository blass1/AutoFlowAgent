---
mode: agent
description: Exporta un Test a un archivo importable por ALM (xlsx por defecto). Cada paso del Test (test.step) queda como un row con Test ID, Test Name, Step Number, Step Name, Description y Expected Result.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Exportar a ALM

Sub-flow para tomar un **Test** y emitir un archivo (xlsx / csv / json) con la descripción paso a paso lista para importar en ALM o pushear a su API. **Granularidad: un archivo por Test** (un Test por corrida del flujo).

## 1. Elegir Test Set

Listá `.autoflow/testsets/*.json`. Si no hay ninguno, decile: `Todavía no hay **Test Sets**. Creá uno con la opción "Crear Test Set" primero.` y volvé al menú.

`#tool:vscode/askQuestions` single-select: `"¿De qué **Test Set** querés exportar un **Test**?"` con cada set como opción.

## 2. Elegir Test

Leé el spec del set elegido (`tests/{slug}-{id}.spec.ts`) y extraé los bloques `test('{nombre} [testId:{numero}]', ...)`. Si el archivo no existe o no tiene `test()`, frená y avisá al QA.

`vscode/askQuestions` single-select: `"¿Qué **Test** exportás?"` con cada test como opción mostrando `{nombre} [testId:{numero}]`.

## 3. Elegir formato

`vscode/askQuestions` single-select: `"¿En qué formato?"`:
- `📊 xlsx (recomendado, importable directo a ALM)`
- `📄 csv (universal, parsea cualquier sistema)`
- `🔧 json (para API directa)`

Default visual: el primero. Anotá el `formato` elegido.

## 4. Ejecutar el script

Disparalo con `runCommands`:
```
node .autoflow/scripts/exportar-alm.js {slug} --test={testId} --format={formato}
```

El script imprime al final una línea con prefijo `AUTOFLOW_EXPORT:` + JSON. Leela con `terminalLastCommand`.

- `ok: true` → tenés `path` (ruta al archivo generado), `rows` (cantidad de pasos exportados), `format`.
- `ok: false` o el script falló (exit code ≠ 0) → mostrale al QA el error concreto del stderr.

## 5. Cierre

Mostrale al QA un resumen:
```
✅ Exporté el **Test** [testId:{testId}] al archivo:
  📁 {path}

Total de pasos: {rows}
Formato: {format}

Tip: el archivo tiene las columnas Test ID, Test Name, Step Number, Step Name, Description y Expected Result. Description es técnica (llamadas a métodos del PO + page.goto). Expected Result se llena solo si el step tiene asserts.
```

Después abrí `vscode/askQuestions` single-select: `"¿Algo más?"`:
- `📂 Abrir la carpeta de exports` → ejecutá con `runCommands` el comando para abrir `.autoflow/alm-exports/` (`start ` en Windows, `open ` en macOS, `xdg-open ` en Linux). Al volver, releé este menú.
- `📤 Exportar otro **Test**` → volvé al paso 1.
- `🏠 Volver al menú`

## Notas

- **Granularidad un Test por archivo**: si querés exportar varios Tests del mismo Test Set, hacelo uno por uno. Más adelante puede convenir batch (todos los Tests del set de una), pero por ahora simple.
- **Description técnica**: las líneas describen las llamadas a métodos del PO (ej: `Llamar a LoginPage.ingresar(usuarioPrincipal.user, usuarioPrincipal.pass)`). El QA puede afinarlas en ALM una vez importadas.
- **Expected Result**: extraído de los `await expect(...)` dentro del cuerpo del step. Si el step no tiene assert, queda **vacío** intencionalmente (el QA en ALM lo completa o lo deja vacío).
- **Output**: `.autoflow/alm-exports/{slug}-testId-{testId}-{timestamp}.{ext}`. La carpeta ya existe (también la usa `parse-alm-export.js` para imports). Los `.xlsx`/`.csv`/`.json` quedan **gitignored** — son artefactos efímeros de exportación.
