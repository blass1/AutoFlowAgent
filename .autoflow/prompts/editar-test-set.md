---
mode: agent
description: Edita un Test Set existente — agregar/quitar Tests, renombrar, cambiar descripción, eliminar.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Editar Test Set

## 1. Elegir Test Set

Listá `.autoflow/testsets/*.json`. Si no hay ninguno, decile: `Todavía no hay **Test Sets**. Creá uno con la opción "Crear Test Set" primero.` y volvé al menú.

Usá `#tool:vscode/askQuestions` single-select: `"¿Qué **Test Set** querés editar?"` con cada set como opción (mostrá `{nombre} [testSetId:{id}] ({N} **Tests**)`):
- `📦 Dolar MEP [testSetId:12345] (3 **Tests**)`
- `📦 Regresion de compras [testSetId:44534] (5 **Tests**)`
- ...

## 2. Elegir acción

Usá `vscode/askQuestions` single-select: `"¿Qué querés hacer con \"{nombre}\" [testSetId:{id}]?"`:
- `➕ Agregar **Tests**`
- `➖ Quitar **Tests**`
- `✏️ Renombrar`
- `📝 Cambiar descripción`
- `🗑️ Eliminar el **Test Set**`

### `➕ Agregar Tests`

1. Listá los `test()` de `tests/*.spec.ts` (excluido `tests/_temp/`) que **no** estén ya en `casos` del set, mostrando cada uno por su nombre (`{nombre} [testId:{numero}]`).
2. Usá `vscode/askQuestions` **multi-select**: `"¿Qué **Tests** agrego?"` con cada candidato como opción tildable.
3. Confirmá con `vscode/askQuestions` single-select `"¿Confirmás?"`: `✅ Sí` / `❌ Cancelar`.
4. **Mover** los `test('...', ...)` seleccionados desde sus specs de origen al `test.describe` del spec destino (`tests/{slug}-{id}.spec.ts`). Sumá los imports de **Page Objects** y data que falten. Si el spec origen queda vacío (sin `test()` adentro del `describe`), borrá el archivo. Actualizá el `casos[]` del JSON destino y removelos del JSON origen. Cada **Test** vive en un solo **Test Set**.

### `➖ Quitar Tests`

1. Listá los `casos` actuales del set.
2. Usá `vscode/askQuestions` **multi-select**: `"¿Qué **Tests** quito?"` con cada uno como opción tildable.
3. Confirmá con `vscode/askQuestions` single-select.
4. Removelos del array y guardá. **No** borres los `test('...')` del spec automáticamente — pediselo explícitamente al QA en una segunda pregunta single-select: `"¿Borro también los bloques `test()` del spec?"`. Si dice sí, sacalos del archivo (si el `describe` queda vacío, dejá el `describe` con el comentario `// Sin Tests`).

### `✏️ Renombrar`

1. Usá `vscode/askQuestions` text input: `"¿Cómo se va a llamar ahora?"`.
2. Recalculá `slug` en **camelCase** (sin acentos, primera palabra minúscula, resto capitalizado, sin separadores). Si difiere, **renombrá el archivo** de `{slugViejo}.json` a `{slugNuevo}.json`. Si hay un spec asociado en `tests/{slugViejo}-{id}.spec.ts`, renombralo también a `tests/{slugNuevo}-{id}.spec.ts` y actualizá el `test.describe` de adentro al nuevo nombre `"{nombreNuevo} [testSetId:{id}]"`.
3. Actualizá `nombre`, `slug` y `specPath` en el JSON. Guardá.

### `📝 Cambiar descripción`

1. Usá `vscode/askQuestions` text input: `"Nueva descripción:"`.
2. Actualizá `descripcion`. Guardá.

### `🗑️ Eliminar el Test Set`

1. Confirmá con `vscode/askQuestions` single-select: `"¿Seguro? Los archivos de los **Tests** en tests/ no se tocan, solo se borra el JSON."`:
   - `❌ Sí, eliminar`
   - `↩️ No, cancelar`
2. Si confirma, borrá `.autoflow/testsets/{slug}.json`.

## 3. Cierre

Mostrá `✅ "{nombre}" actualizado.` (o `🗑️ "{nombre}" eliminado.`).

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🔧 Hacer otro cambio`
- `🏠 Volver al menú`
