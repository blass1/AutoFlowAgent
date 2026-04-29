---
mode: agent
description: Edita un test set existente — agregar/quitar casos, renombrar, cambiar descripción, eliminar.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Editar test set

## 1. Elegir test set

Listá `.autoflow/testsets/*.json`. Si no hay ninguno, decile: `Todavía no hay test sets. Creá uno con la opción "Crear test set" primero.` y volvé al menú.

Usá `#tool:vscode/askQuestions` single-select: `"¿Qué test set querés editar?"` con cada set como opción:
- `📦 Mobile Banking - Login (3 casos)`
- `📦 Home Banking - Transferencias (5 casos)`
- ...

## 2. Elegir acción

Usá `vscode/askQuestions` single-select: `"¿Qué querés hacer con \"{nombre}\"?"`:
- `➕ Agregar casos`
- `➖ Quitar casos`
- `✏️ Renombrar`
- `📝 Cambiar descripción`
- `🗑️ Eliminar el test set`

### `➕ Agregar casos`

1. Listá `tests/*.spec.ts` que **no** estén ya en `casos` del set.
2. Usá `vscode/askQuestions` **multi-select**: `"¿Qué casos agrego?"` con cada candidato como opción tildable.
3. Confirmá con `vscode/askQuestions` single-select `"¿Confirmás?"`: `✅ Sí` / `❌ Cancelar`.
4. Agregá los seleccionados al array `casos` del JSON y guardá.

### `➖ Quitar casos`

1. Listá los `casos` actuales del set.
2. Usá `vscode/askQuestions` **multi-select**: `"¿Qué casos quito?"` con cada uno como opción tildable.
3. Confirmá con `vscode/askQuestions` single-select.
4. Removelos del array y guardá.

### `✏️ Renombrar`

1. Usá `vscode/askQuestions` text input: `"¿Cómo se va a llamar ahora?"`.
2. Recalculá slug. Si difiere, **renombrá el archivo** de `{slug-viejo}.json` a `{slug-nuevo}.json`.
3. Actualizá `nombre` y `slug` en el JSON. Guardá.

### `📝 Cambiar descripción`

1. Usá `vscode/askQuestions` text input: `"Nueva descripción:"`.
2. Actualizá `descripcion`. Guardá.

### `🗑️ Eliminar el test set`

1. Confirmá con `vscode/askQuestions` single-select: `"¿Seguro? Los archivos de los casos en tests/ no se tocan, solo se borra el JSON."`:
   - `❌ Sí, eliminar`
   - `↩️ No, cancelar`
2. Si confirma, borrá `.autoflow/testsets/{slug}.json`.

## 3. Cierre

Mostrá `✅ "{nombre}" actualizado.` (o `🗑️ "{nombre}" eliminado.`).

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🔧 Hacer otro cambio`
- `🏠 Volver al menú`
