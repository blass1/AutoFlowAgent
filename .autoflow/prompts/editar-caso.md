---
mode: agent
description: Edita un caso existente — regrabar desde cero, abrir el código, o agregar pasos al final.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Editar caso

## 1. Elegir test set

Leé todos los `.json` en `.autoflow/testsets/`. Para los archivos de `tests/` que no estén en ningún set, sumá la opción "Casos sueltos".

Usá `#tool:vscode/askQuestions` single-select: `"¿De qué test set?"` con opciones:
- `📦 {nombre del set 1}`
- `📦 {nombre del set 2}`
- ...
- `📂 Casos sueltos (sin test set)`

Si no hay ningún test set, saltá este paso y pasá directo al paso 2 con la lista de casos sueltos.

## 2. Elegir caso

Leé los casos del set elegido (o los sueltos). Para cada archivo, inferí un nombre legible (extraído del `test('...')` interno o del filename).

Usá `vscode/askQuestions` single-select: `"¿Qué caso?"` con cada caso como opción:
- `✏️ TC-4521 - Login con OTP`
- `✏️ TC-4522 - Login con biometría`
- ...

## 3. Acción a tomar

Usá `vscode/askQuestions` single-select: `"¿Qué hacés con TC-{numero}?"`:
- `🔄 Regrabar desde cero`
- `📝 Editar el código manualmente`
- `➕ Agregar pasos al final (modo append)`

### Opción `🔄 Regrabar desde cero`

1. Leé `tests/{archivo}.spec.ts` y extraé URL inicial (primer `page.goto`).
2. Inferí `nombre`, `numero`, `canal` del nombre/contenido del archivo.
3. Confirmá los datos con `vscode/askQuestions` single-select `"¿Va con estos datos?"`:
   - `✅ Sí, regrabar`
   - `✏️ Cambiar algo`
4. Si confirma, delegá a `crear-caso.md` desde el paso 3 (no preguntes datos de nuevo, ya los tenés).

### Opción `📝 Editar el código manualmente`

1. Leé `tests/{archivo}.spec.ts` y extraé los `import` que apunten a `pages/...`.
2. Resolvé los paths a archivos.
3. Ejecutá con `runCommands`:
   ```
   code -r tests/{archivo}.spec.ts pages/{po1}.ts pages/{po2}.ts ...
   ```
4. Decile al QA: `Te abrí el test y los Page Objects relacionados.`

### Opción `➕ Agregar pasos al final`

1. Marcá en `.autoflow/recordings/{numero}-session.json` el campo `"modo": "append"`.
2. Inferí URL final del test (último `page.goto` o estado tras la última acción) y lanzá codegen apuntando ahí.
3. Cuando el QA diga `terminé`, en `generar-pom.md` mergeá los pasos nuevos al test existente en lugar de sobrescribir.

## 4. Volver al menú

Después de cualquier opción, abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"` con:
- `✏️ Editar otro caso`
- `🏠 Volver al menú`
