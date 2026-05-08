---
mode: agent
description: Crea un Test Set agrupando Tests existentes en un JSON dentro de .autoflow/testsets/.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Crear Test Set

## 1. Datos del set

Usá `#tool:vscode/askQuestions` con tres text inputs en una sola llamada (carousel):
1. `"¿Cómo querés llamar al **Test Set**?"` → text input (ej: `Dolar MEP`)
2. `"Test Set ID"` → text input (ej: `12345`)
3. `"Dame una descripción corta."` → text input

Generá `slug` desde `nombre` en **camelCase**: sin acentos, primera palabra minúscula, resto capitalizado, sin separadores. Ej: `Dolar MEP` → `dolarMep`, `Regresion de compras` → `regresionDeCompras`.

El nombre del archivo spec asociado a este **Test Set** será `tests/{slug}-{id}.spec.ts` (camelCase + guion + id). Ej: `tests/dolarMep-12345.spec.ts`. Adentro va un único `test.describe('{nombre} [testSetId:{id}]', () => { ... })` que va a contener todos los **Tests** del set.

Si `.autoflow/testsets/{slug}.json` ya existe, abrí `vscode/askQuestions` single-select: `"Ya existe un **Test Set** con ese nombre, ¿qué hacemos?"`:
- `✏️ Probar otro nombre`
- `⚠️ Sobrescribir`
- `❌ Cancelar`

## 2. Elegir Tests (multi-select)

Listá todos los `tests/*.spec.ts` (excluido `tests/_temp/`). Para cada archivo, leé los `test('...')` adentro y extraé el nombre completo (incluido el sufijo `[testId:N]`).

Usá `vscode/askQuestions` **multi-select**: `"¿Qué **Tests** incluyo?"` con cada `test()` como opción tildable, **más** una opción extra al final:
- `Compra de dolar mep con CA [testId:43213]`
- `Compra de dolar mep con CC [testId:43214]`
- `Login con OTP [testId:4521]`
- ...
- `📭 Crear vacío (sin **Tests** por ahora)`

Si tilda `📭 Crear vacío`, ignorá cualquier otra selección y seguí con `casos = []`.

Si todavía no hay **Tests** en `tests/*.spec.ts`, no bloquees el flujo: mostrale solo la opción `📭 Crear vacío` y un mensaje corto: `Todavía no hay **Tests** en tests/. Podés crear el **Test Set** vacío y agregar **Tests** después.`

## 3. Confirmar y guardar

Mostrale los seleccionados:
```
Voy a crear el **Test Set** "{nombre}" [testSetId:{id}] con estos **Tests**:

  • Compra de dolar mep con CA [testId:43213]
  • Compra de dolar mep con CC [testId:43214]
```

Después abrí `vscode/askQuestions` single-select: `"¿Va?"`:
- `✅ Crear`
- `✏️ Cambiar selección`
- `❌ Cancelar`

Si confirma:

1. Leé `.autoflow/user.json` y escribí `.autoflow/testsets/{slug}.json`:
   ```json
   {
     "nombre": "<nombre>",
     "slug": "<slug>",
     "id": "<id>",
     "descripcion": "<descripcion>",
     "specPath": "tests/{slug}-{id}.spec.ts",
     "creadoPor": { "nombre": "<qa.nombre>", "legajo": "<qa.legajo>" },
     "creadoEn": "<iso-ahora>",
     "casos": [
       { "numero": "<testId>", "nombre": "<nombre del Test>" }
     ]
   }
   ```

   > ### ⚠️ REGLA CRÍTICA — `specPath` va a nivel **raíz** del JSON, NUNCA dentro de `casos[]`
   >
   > El dashboard, `run-testset.js`, `validar-coherencia.js` y `exportar-alm.js` leen `set.specPath` (nivel raíz). Si lo metés dentro de cada caso, el dashboard no encuentra el spec, los Tests aparecen vacíos y la corrida del set falla.
   >
   > **❌ INCORRECTO** — `specPath` dentro de `casos[]`:
   > ```json
   > {
   >   "nombre": "Dolar MEP",
   >   "slug": "dolarMep",
   >   "id": "12345",
   >   "casos": [
   >     { "numero": "43213", "nombre": "Compra con CA", "specPath": "tests/dolarMep-12345.spec.ts" }
   >   ]
   > }
   > ```
   >
   > **✅ CORRECTO** — `specPath` a nivel raíz, `casos[]` sólo con `numero` + `nombre`:
   > ```json
   > {
   >   "nombre": "Dolar MEP",
   >   "slug": "dolarMep",
   >   "id": "12345",
   >   "specPath": "tests/dolarMep-12345.spec.ts",
   >   "casos": [
   >     { "numero": "43213", "nombre": "Compra con CA" }
   >   ]
   > }
   > ```
   >
   > Todos los casos del set comparten el mismo archivo spec, así que es redundante repetirlo por caso. Si el set se creó vacío, `casos: []` y `specPath` igual va a nivel raíz.

2. **Creá siempre el archivo spec en `tests/{slug}-{id}.spec.ts`** — cada **Test Set** tiene sí o sí un archivo de spec asociado, aunque arranque vacío. Si el archivo ya existe, no lo pises: avisá y abortá el guardado del JSON.
   - **Si el set es vacío**, escribí solo el header con el `test.describe` listo para recibir **Tests**:
     ```ts
     import { test, expect } from '../fixtures';

     test.describe('<nombre> [testSetId:<id>]', () => {
       // Agregá los **Tests** con la opción "Crear caso" del menú.
     });
     ```
   - **Si tiene Tests seleccionados**, moveé los bloques `test('...', ...)` originales desde sus specs de origen al `test.describe` del nuevo archivo, junto con los imports de **Page Objects** y data que usen. Después de copiarlos, borrá esos bloques del spec original (si queda vacío, borrá el archivo) y actualizá el JSON del **Test Set** anterior sacando esos **Tests**. Cada **Test** vive en un solo **Test Set**.

## 4. Cierre

Mostrá:
```
✅ **Test Set** "{nombre}" [testSetId:{id}] creado con {N} **Tests**.
Path: .autoflow/testsets/{slug}.json
```

Después abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `🚀 Correrlo ahora`
- `🔧 Editarlo`
- `🏠 Volver al menú`
