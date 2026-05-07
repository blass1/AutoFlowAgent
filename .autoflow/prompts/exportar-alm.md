---
mode: agent
description: Exporta un Test a un archivo importable por ALM (xlsx por defecto). Un row por cada Nodo de la traza, con Step (label corto), Description (humanizada en castellano) y Expected Result (humanizado).
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Exportar a ALM

Sub-flow para tomar un **Test** y emitir un archivo (xlsx / csv / json) con la descripción paso a paso lista para importar en ALM o pushear a su API. **Granularidad: un archivo por Test, un row por cada Nodo de la traza** (cada acción atómica del flujo). Las descripciones y expected results se generan en castellano humanizado para que un QA pueda leer el archivo en ALM y recrear el caso a mano sin tener que mirar código.

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

Total de Nodos exportados: {rows}
Formato: {format}

Tip: el archivo tiene las columnas Test ID, Test Name, Step Number, Step, Description y Expected Result. Cada row es una acción atómica del flujo (click, llenar campo, validar, capturar, etc.) descrita en castellano humanizado, lista para que cualquier QA pueda recrear el caso leyendo solo este archivo.
```

Después abrí `vscode/askQuestions` single-select: `"¿Algo más?"`:
- `📂 Abrir la carpeta de exports` → ejecutá con `runCommands` el comando para abrir `.autoflow/alm-exports/` (`start ` en Windows, `open ` en macOS, `xdg-open ` en Linux). Al volver, releé este menú.
- `📤 Exportar otro **Test**` → volvé al paso 1.
- `🏠 Volver al menú`

## Notas

- **Granularidad un Test por archivo**: si querés exportar varios Tests del mismo Test Set, hacelo uno por uno. Más adelante puede convenir batch, pero por ahora simple.
- **Fuente de verdad: la traza** (`.autoflow/recordings/{testId}-path.json`) cruzada con `.autoflow/nodos.json`. Cada Nodo de la traza se convierte en un row. Si el path.json no existe, el script frena y le indica al QA cómo regenerarlo.
- **Step**: label corto del tipo de acción — `Click`, `Llenar campo`, `Navegar`, `Validar visibilidad`, `Validar texto exacto`, `Capturar valor`, `Verificar igualdad`, etc. Mapeado desde la `accion` y el `matcher` del Nodo.
- **Description humanizada**: prosa en castellano describiendo qué hace el paso desde la perspectiva del usuario. Ejemplos:
  - `"Se hace click en el botón 'Aceptar'"`
  - `"Se ingresa el valor correspondiente en el campo 'Usuario'"`
  - `"Se valida que el texto 'Bienvenido' sea visible en pantalla"`
  - `"Se extrae el valor de el campo 'Saldo' y se almacena en la variable 'saldoInicial'"`
  - `"Se compara el valor actual de el campo 'Saldo' y se verifica que haya disminuido respecto del valor 'saldoInicial' capturado anteriormente"`
- **Expected Result humanizado**: descripción del comportamiento, respuesta o estado final esperado. Ejemplos:
  - `"Se dispara la acción asociada al elemento (navegación, apertura de menú, envío de formulario, etc.)."`
  - `"El campo acepta el valor ingresado y queda listo para continuar el flujo."`
  - `"El elemento aparece visible en la pantalla, en una ubicación accesible para el usuario."`
- **Output**: `.autoflow/alm-exports/{slug}-testId-{testId}-{timestamp}.{ext}`. La carpeta ya existe (también la usa `parse-alm-export.js` para imports). Los `.xlsx`/`.csv`/`.json` quedan **gitignored** — son artefactos efímeros de exportación.
