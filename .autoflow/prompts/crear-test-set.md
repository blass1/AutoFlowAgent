---
mode: agent
description: Crea un test set agrupando casos existentes en un JSON dentro de .autoflow/testsets/.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Crear test set

## 1. Datos del set

Usá `#tool:vscode/askQuestions` con tres text inputs en una sola llamada (carousel):
1. `"¿Cómo querés llamar al test set?"` → text input (ej: `Regresion de compras`)
2. `"Test Set ID"` → text input (ej: `44534`)
3. `"Dame una descripción corta."` → text input

Generá `slug` desde `nombre` en **camelCase**: sin acentos, primera palabra minúscula, resto capitalizado, sin separadores. Ej: `Regresion de compras` → `regresionDeCompras`.

El nombre del archivo spec asociado a este test set será `tests/{slug}-{id}.spec.ts` (camelCase + guion + id). Ej: `tests/regresionDeCompras-44534.spec.ts`.

Si `.autoflow/testsets/{slug}.json` ya existe, abrí `vscode/askQuestions` single-select: `"Ya existe un set con ese nombre, ¿qué hacemos?"`:
- `✏️ Probar otro nombre`
- `⚠️ Sobrescribir`
- `❌ Cancelar`

## 2. Elegir casos (multi-select)

Listá todos los `tests/*.spec.ts`. Para cada archivo, inferí un nombre legible.

Usá `vscode/askQuestions` **multi-select**: `"¿Qué casos incluyo?"` con cada test como opción tildable:
- `TC-4521 - Login con OTP`
- `TC-4522 - Login con biometría`
- `TC-4530 - Transferencia entre cuentas propias`
- ...

Si todavía no hay tests, decile: `Todavía no hay casos en tests/. Creá uno con la opción "Crear caso" primero.` y volvé al menú.

## 3. Confirmar y guardar

Mostrale los seleccionados:
```
Voy a crear el test set "{nombre}" con estos casos:

  • tests/regresionDeCompras-44534.spec.ts
```

Después abrí `vscode/askQuestions` single-select: `"¿Va?"`:
- `✅ Crear`
- `✏️ Cambiar selección`
- `❌ Cancelar`

Si confirma, leé `.autoflow/user.json` y escribí `.autoflow/testsets/{slug}.json`:
```json
{
  "nombre": "<nombre>",
  "slug": "<slug>",
  "id": "<id>",
  "descripcion": "<descripcion>",
  "creadoPor": { "nombre": "<qa.nombre>", "legajo": "<qa.legajo>" },
  "creadoEn": "<iso-ahora>",
  "casos": ["tests/regresion-de-compras-44534.spec.ts"]
}
```

## 4. Cierre

Mostrá:
```
✅ Test set "{nombre}" creado con {N} casos.
Path: .autoflow/testsets/{slug}.json
```

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🚀 Correrlo ahora`
- `🔧 Editarlo`
- `🏠 Volver al menú`
