---
mode: agent
description: Sub-flow de generar-pom.md (paso 5.5). Maneja la colisión cuando el QA elige un nombre de Page Object que ya existe — ofrece reusar método, agregar método nuevo a la PO existente, o cambiar el nombre.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Colisión con Page Object existente

Sub-flow de `generar-pom.md`. Se entra acá **solo** si el nombre que el QA tipeó en el paso 5 coincide con un PO que ya existe en `pages/`. Es una **oportunidad** (consolidar conocimiento de pantalla en un único PO), no un error.

Cuando arranca, ya tenés:
- El **rango de nodos** que el QA quiere agrupar (acciones del usuario del recording, sin asserts).
- El **nombre PascalCase** propuesto (que coincide con `pages/{Nombre}Page.ts`).
- `parsed.json` y `nodos.json` cargados.

## 1. Cargar el PO existente

1. Leé `pages/{Nombre}Page.ts` y extraé los **métodos públicos** (`async <nombre>(...)` que no sean `private`/`#`). Para cada método, anotá:
   - `nombreMetodo`
   - `firma` (parámetros)
   - `cuerpo` (líneas dentro del método, hasta el `}` de cierre)
   - `selectoresUsados` — lista ordenada de `(accion, selectorRaw)` extraídos del cuerpo. Heurística: cada línea `await this.<locator>.<accion>(...)` mapea a `(accion, selectorRaw del locator privado)`. Resolvé `selectorRaw` cruzando con la asignación del constructor (`this.<locator> = page.<selectorRaw>`).
2. Leé `.autoflow/fingerprints/{Nombre}.json` (sidecar). Tenés `nodos[]` planos.

## 2. Comparar con el rango actual

El rango que el QA quiere agrupar es una secuencia de nodos (acciones del usuario, sin asserts) con su `selectorRaw` y `accion` en `nodos.json` (vía `parsed.json`).

Para cada método existente, calculá la **similitud** = porcentaje de pasos del rango que matchean en orden contra los `selectoresUsados` del método.

- Match exacto: `(accion, selectorRaw)` idénticos.
- Match parcial: `accion` igual + `selector` normalizado igual (descontando modificadores).
- Si la secuencia del rango es **subsecuencia exacta** de los selectores del método o viceversa → **similitud alta** (≥80%).
- Si comparten al menos el **primer y último paso** + parte del medio → similitud media (50–80%).
- Si no → similitud baja (<50%, no se ofrece como opción).

## 3. Preguntar al QA qué hacer

Single-select `vscode/askQuestions`: `"⚠️ {Nombre}Page ya existe. ¿Qué hacés con este rango?"`. Opciones (en este orden):

- Por cada método con similitud ≥50%, una opción:
  - `🔁 Reusar método "{nombreMetodo}({firma})" — cubre {N}/{M} pasos del rango ({similitud}%)`
- Después de las opciones de reuso (si las hay):
  - `🆕 Agregar método nuevo dentro de {Nombre}Page (recomendado si ningún match es exacto)`
- Siempre al final:
  - `✏️ Cambiar el nombre (no es la misma pantalla, fue casualidad)` → vuelve al paso 5 de `generar-pom.md` esperando otro comando.

## 4. Si elige reusar

- **NO** se crea ni se modifica `pages/{Nombre}Page.ts`. **NO** se modifica el sidecar (`nodos[]` ya tiene esos ids; no duplicar).
- Persistí el grupo en `{numero}-grupos.json` igual que en el paso 6.5 de `generar-pom.md` con `{ page, desde, hasta, metodoReusado: '<nombreMetodo>' }`. El campo `metodoReusado` lo usa el spec en el paso 8.b para elegir qué método llamar.
- Si entre los pasos del rango hay **asserts** que NO están en `sidecar.asserts[]`, sumalos al sidecar y a `nodos.json` (los asserts no son parte del método público; son enriquecimiento de la firma de la page).
- Si hay nodos `capturar`/`verificar` en el rango, son siempre nuevos: agregalos a `nodos.json`. El spec los va a emitir inline después de la llamada al método reusado.
- Volvé al paso 4 de `generar-pom.md` (mostrá el listado actualizado: la page agrupada va con ✅ colapsada).

## 5. Si elige agregar método nuevo

- **NO** se crea archivo nuevo. **EDITÁ** `pages/{Nombre}Page.ts`:
  1. Si los nodos del rango usan locators que ya están en el constructor (mismo `selectorRaw`), reusalos. NO sumes locators duplicados.
  2. Para cada locator nuevo, sumá `private readonly {nombreLocator}: Locator;` al bloque de declaraciones y la inicialización en el constructor (`selectorRaw` verbatim, ver paso 6 de `generar-pom.md`).
  3. Sumá el método público nuevo siguiendo todas las reglas del paso 6 (verbo en infinitivo, JSDoc de una línea, `pressSequentially`, buffer si aplica, `waitForLoadState('domcontentloaded')` si dispara navegación). El método retorna `Promise<void>` siempre — no retorna otra Page.
- **EDITÁ** el sidecar `.autoflow/fingerprints/{Nombre}.json`:
  - Sumá los ids de los nodos nuevos al final de `nodos[]` (ya están en orden por el rango). Mantené los ids existentes intactos. Si un id se repite (locator reusado, misma acción), no lo dupliques.
  - Sumá los asserts nuevos a `asserts[]` sin duplicar.
- **Actualizá** `nodos.json` igual que en el paso 6.3 de `generar-pom.md` (nuevos ids, sin sobreescribir existentes).
- Persistí el grupo en `{numero}-grupos.json` con `{ page, desde, hasta, metodoNuevo: '<nombreMetodoCreado>' }`.
- Volvé al paso 4 de `generar-pom.md` con la page actualizada.

## 6. Notas

- La detección de similitud es heurística — el QA siempre tiene la última palabra. Si proponés "reusar" mal, el QA elige "agregar método nuevo" y ya.
- Si el método reusado **retorna otra page**, el spec va a usar el retorno tal cual (`const overview = await login.ingresar(...)`). Si el método nuevo creado retorna otra page (porque la última acción navega), seguí la misma regla del paso 6 de `generar-pom.md`.
