---
mode: agent
description: Sub-flow de generar-pom.md para el modo "Añadir pasos al final del Test" (regrabados, no manuales). Mergea pasos al spec existente reusando Page Objects ya conocidos.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Añadir pasos grabados al final de un Test

Sub-flow de `generar-pom.md` que se invoca cuando `session.modo === "append"` (flag interno; visible al QA como **"Añadir pasos al final del Test"**). En este modo no se generan **Page Objects** nuevos ni **Test Sets** nuevos: los pasos del recording se mergean al `test()` existente reusando los locators y métodos de las pages ya conocidas.

> **Diferencia con `append-manual.md`**: ese flujo arranca del HTML pegado por el QA (sin grabar). Este otro arranca de un recording de codegen.

La sesión ya trae:
- `numero` del **Test** original (testId)
- `specPath` del spec ya existente (`tests/{slug}-{id}.spec.ts`)
- `testNombre` — el nombre del `test('...')` que se va a extender (formato `"{nombre} [testId:{numero}]"`)

## A.1. Cerrar la sesión y parsear

Igual al paso 1 de `generar-pom.md` (marcar `activa: false`, `fechaFin`) y al paso 2 (correr `parse-codegen-output.js {numero}` para tener `parsed.json`).

## A.2. Matchear contra Page Objects existentes

Igual al paso 3 de `generar-pom.md` (matcheo por vocabulario contra `.autoflow/fingerprints/*.json`). En este modo esperamos que **TODOS** los nodos matcheen con **Page Objects** conocidos — el QA está extendiendo un flujo, no creando pantallas nuevas.

Si quedan pasos en "Nuevo" sin matchear:
- Mostralos al QA y abrí `vscode/askQuestions` single-select:
  - `🆕 Agruparlos como **Page Objects** nuevos (caemos al flujo normal del paso 4)` — si el QA confirma, salí de este sub-flow y seguí desde el paso 4 del `generar-pom.md` normal.
  - `↩️ Cancelar (no toco nada)` — borrá los archivos temporales y volvé al menú.

## A.3. Confirmar con el QA

Mostrá el listado de los pasos nuevos asignados a sus **Page Objects** existentes, formato similar al paso 4 de `generar-pom.md`, y confirmá:

```
Voy a añadir al final del **Test** [testId:{numero}] estos pasos:

✅ AccesoFima
   ✅ Paso 1: Click en botón "Fondos Fima"           [4/5]
   ✅ Paso 2: Click en botón "Fima Premium"          [2/5]

✅ ConfirmarSuscripcion
   ✅ Paso 3: Click en botón "Suscribir"             [4/5]
```

`vscode/askQuestions` single-select: `"¿Confirmás añadir los pasos?"`:
- `✅ Sí, añadirlos`
- `❌ Cancelar`

## A.4. Editar el spec (sin regenerar)

1. Leé `tests/{slug}-{id}.spec.ts`.
2. Localizá el bloque `test('{testNombre}', ...)` exacto **dentro del `test.describe`**. El nombre tiene formato `"{nombre} [testId:{numero}]"`. Si no aparece, frená y avisá al QA.
3. Identificá el **bloque de instancias** del Test (al inicio del `test()`, después del destructuring de data): `const loginPage = new LoginPage(page); const overviewPage = new OverviewPage(page); ...`. Es la lista visual de las pages que el Test usa.
4. Para cada page del añadido:
   - Si la page **ya está** en el bloque de instancias (porque ya se usaba en el Test), reusá esa variable. No agregues una nueva instancia.
   - Si la page es **nueva** para este Test (primera vez que aparece tras añadir pasos), agregá una línea más al bloque de instancias respetando el orden y la prolijidad (ej: `const transferenciasPage = new TransferenciasPage(page);`).
5. Para cada paso del añadido, envolvelo en su propio `test.step('comentario corto', async () => { ... })` — mismo estilo que el resto del **Test**. El cuerpo es `await {paginaCamelCase}.{metodo}(args)`. **Reusá los nombres de método que ya existen en cada PO** — no inventes métodos nuevos. Si los pasos del recording no encajan en ningún método público existente, frená y avisá al QA: el caso requiere editar los POs, lo que cae fuera del scope de este modo.
6. Insertá los nuevos `test.step(...)` justo **antes del cierre** del bloque `test()`, después del último step.

## A.5. Sidecars y `nodos.json`

- Los nodos añadidos ya existen en `nodos.json` (son los mismos ids reusados de pages conocidas) — no se agregan ni modifican.
- Los sidecars de las pages involucradas tampoco cambian — el matcheo confirmó que el flujo de cada page es el mismo.
- Si surgió un assert nuevo (`assert` que no estaba en el sidecar.asserts[]), sí sumalo a `asserts[]` del sidecar correspondiente y a `nodos.json`.

## A.6. Traza

Generá la traza igual que en el paso 8.c / 9 de `generar-pom.md` (`generar-traza.js {numero}`) — la nueva traza reemplaza a la vieja en `{numero}-path.json`. El añadido redefine el camino completo del **Test**, no solo lo nuevo. Verificá que el archivo se generó (gate del paso 9 del prompt principal).

## A.7. Limpieza

Borrá `parsed.json`, `grupos.json` (si se creó) y el `.spec.ts` temporal de la grabación (no el spec del **Test Set**, que vive en `tests/`). Mantené `session.json` (con `modo: "append"` para historial) y `path.json`.

## A.8. Resumen

```
✅ Listo. Añadí al final del **Test** [testId:{numero}] en {specPath}:
  • {N} pasos nuevos en {pages involucradas}
```

`vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `▶️ Correrlo ahora`
- `✏️ Editar otra cosa`
- `🏠 Volver al menú`
