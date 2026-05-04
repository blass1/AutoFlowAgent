---
mode: agent
description: Después de cerrar el browser de codegen, muestra los pasos capturados y los agrupa interactivamente con el QA en Page Objects, reconociendo pages que ya existen.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Generar Page Objects (agrupación interactiva)

Se carga cuando vuelve el control después de `playwright codegen` (la task `autoflow:start-recording` retornó porque el QA cerró el browser).

## 1. Cerrar la sesión

Si todavía no se hizo:

1. Leé `.autoflow/recordings/{numero}-session.json`.
2. Marcá `"activa": false` y agregá `"fechaFin": "<iso-ahora>"`. Guardá.

## 2. Parsear el codegen

Ejecutá con `runCommands`:
```
node .autoflow/scripts/parse-codegen-output.js {numero}
```

El script produce `.autoflow/recordings/{numero}-parsed.json` con la lista ordenada de **nodos crudos** (sin page asignada todavía). Cada nodo tiene la forma:

```json
{
  "indice": 1,
  "accion": "fill",                      // goto | fill | click | press | check | uncheck | selectOption | hover | dragTo | assert
  "selector": "getByLabel:Usuario",      // firma normalizada
  "selectorRaw": "getByLabel('Usuario')",
  "valor": "qa.test",                    // solo en fill/press/selectOption/assert/goto
  "matcher": "toBeVisible",              // solo en assert
  "etiqueta": "Usuario",
  "confiabilidad": 3                     // 1-5 (null para goto/assert). Ver pom-rules.md.
}
```

Para `assert`: si el assert es a nivel page (`expect(page).toHaveURL(...)`), `selector` vale `"page"`.

La **page** y el **id final** (`{page}::{accion}::{selector}`) se asignan en los pasos siguientes (matcheo de prefijo + agrupación manual). Llevá un puntero **"page activa"** mientras procesás el recording: arranca vacío, se actualiza cada vez que un nodo se asigna a una page (matcheo o agrupación). Los nodos `assert` con `selector="page"` heredan la page activa al momento del paso.

Si el script falla o no existe, leé directamente `.autoflow/recordings/{numero}.spec.ts` y derivá la lista a mano siguiendo el mismo shape.

## 3. Reconocer pages existentes (prefix matching)

1. Listá los archivos `.autoflow/fingerprints/*.json`. Cada uno es el sidecar de una page existente con el shape `{ page, nodos: [id, id, ...], conecta: [...] }` (ver `.autoflow/conventions/pom-rules.md`). Cargá también `.autoflow/nodos.json` para resolver cada id a su definición.
2. Verificá que el `pages/{page}.ts` correspondiente exista; si no, ignorá ese sidecar (huérfano).
3. Para cada nodo crudo del recording, calculá su id **tentativo** asumiendo que pertenece a una page conocida: probá `{page}::{accion}::{selector}` para cada page candidata. Recorré los nodos del recording de izquierda a derecha (saltando los `assert` para el matcheo: el matching es solo sobre acciones del usuario) y, mientras quede prefijo sin asignar, intentá matchear el prefijo contra los `nodos[]` de cada sidecar conocido. Una page matchea si **todos** sus ids aparecen en orden al inicio del prefijo actual (igualdad exacta de id, y para `fill`/`press`/`selectOption` el `valor` del recording debe coincidir con el del nodo en `nodos.json`, donde `*` matchea cualquier valor). Si matchea, esos nodos quedan asignados a esa page existente, avanzás y actualizás el puntero de **page activa**. Si ninguna matchea, parás y todo lo que sigue queda en `-Nuevo-`.
4. Pages sin sidecar (POs viejos previos a esta convención) **no participan** del matcheo automático.

> Solo prefijo: una vez que hubo un nodo "Nuevo", todos los siguientes son nuevos también, aunque más adelante vuelvan a aparecer nodos de una page conocida. Esto es intencional para mantener el flujo predecible.

**Por cada page que matcheó**, escribí también una entrada en `.autoflow/recordings/{numero}-grupos.json` con el rango de índices del recording que cubrió esa page (`{ rangos: [{ page, desde, hasta }, ...] }`). Esto se hace acá y también en el paso 6.5 — ver detalle ahí. Si hubo asserts inmediatamente después del último nodo de una page matcheada (antes del próximo nodo de acción), atribuilos a esa misma page (page activa) y sumalos a su `sidecar.asserts[]` y a `nodos.json`.

## 4. Mostrar el listado y explicar la sintaxis

> **REGLA INNEGOCIABLE — listado siempre completo.** Cada vez que mostrés este listado (la primera vez y cada vuelta desde el paso 6 después de agrupar una page), tenés que **reimprimir TODOS los pasos del recording, del primero al último, sin omitir ninguno y sin abreviar con `…`, `...`, `[N pasos más]`, `(varios pasos)` ni ningún resumen**. Aunque el recording tenga 50 pasos, los 50 pasos van listados con su número, descripción y confiabilidad. El QA necesita ver todo para elegir bien el rango — si abreviás, el panel de Copilot puede cortar el mensaje y le rompés la decisión. Si te parece largo, igual va completo: no es decisión tuya cortarlo.

Mostrale al QA un mensaje con esta estructura. Las pages existentes aparecen con `✅` y sus pasos también con `✅`. La frontera con lo no agrupado es `-Nuevo-` (sin tilde). Los pasos nuevos van numerados y sin tilde.

```
Estos son los nodos que capturé. Los que ya están en pages existentes
los marqué con ✅. Los de abajo de "Nuevo" tenés que agruparlos vos.
La columna [n/5] es la confiabilidad del locator (5 = id/testid, 1 = CSS frágil).

✅ LoginPage
   ✅ Paso 1: Rellena el campo "Usuario"           [3/5]
   ✅ Paso 2: Rellena el campo "Contraseña"        [3/5]
   ✅ Paso 3: Click en botón "Ingresar"            [4/5]

✅ OverviewPage
   ✅ Paso 4: Click en botón "Inversiones"         [4/5]

— Nuevo —
   Paso 5: Click en botón "Nueva inversión"       [4/5]
   Paso 6: Click en botón "Fondos Fima"           [4/5]
   Paso 7: Click en botón "Fima Premium"          [2/5]
   Paso 8: Click en botón "Suscribir"             [4/5]
   Paso 9: ✓ Verificar que "Confirmación" sea visible    (assert)

Para agrupar, escribime el rango y el nombre de la page:
  • 5-6 AccesoFima        (rango contiguo)
  • 7 ConfirmarSuscripcion (un solo paso)

Reglas:
  • Solo rangos **contiguos**. No se aceptan listas tipo 5,7.
  • Tenés que arrancar siempre por el primer paso de "Nuevo".
  • El nombre va sin sufijo "Page" — yo lo agrego.
  • Si querés cambiar algo de una page ya agrupada, escribime "rehacer".
```

Si **no quedan pasos en "Nuevo"** (todo el flujo matcheó pages existentes), saltá directo al paso 7.

## 4.5. Sugerir una agrupación

Antes de pedir input libre, **proponé una sugerencia** para el primer bloque de pasos en "Nuevo". Heurística:

1. Tomá los pasos contiguos desde el primero de "Nuevo" que parezcan pertenecer a una misma pantalla. Cortá el rango cuando:
   - aparece un `click` con verbo de navegación claro (`Continuar`, `Aceptar`, `Confirmar`, `Suscribir`, `Ingresar`) — incluí ese paso y cerrá el rango ahí.
   - hay un `assert` final del bloque — incluilo y cerrá.
   - el siguiente paso cambia de contexto (otro formulario, otro título).
   Si no hay señal clara, sugerí el rango con los próximos 1-3 pasos.
2. Inferí un nombre PascalCase a partir del paso "ancla" del bloque (el click de cierre o el título del formulario). Ej: click en `Suscribir` → `ConfirmarSuscripcion`; primer fill en `Usuario` → `Login`.
3. Validá el nombre como en el paso 5 (PascalCase, sin choques con pages existentes). Si choca, sumá un sufijo numérico (`Login2`).

Mostrale la sugerencia y abrí `vscode/askQuestions` single-select con estas opciones:
- `✅ Aceptar sugerencia: {n}-{m} {Nombre}` (o `{n} {Nombre}` si es un solo paso)
- `✏️ Agrupar manualmente`
- `↩️ Rehacer la anterior`
- `❌ Cancelar`

Si elige **Aceptar**, andá directo al paso 6 con ese rango y nombre. Si elige **Agrupar manualmente**, seguí al paso 5 esperando el comando libre. Las otras dos se manejan como en el paso 5.

## 5. Recibir el comando de agrupación

Solo se entra acá si el QA eligió `✏️ Agrupar manualmente` en el paso 4.5. Esperá texto libre con uno de estos formatos:

- `<n> <Nombre>` → agrupa solo el paso `n`. Ej: `7 ConfirmarSuscripcion`.
- `<n>-<m> <Nombre>` → agrupa el rango `[n, m]` contiguo. Ej: `5-6 AccesoFima`.
- `rehacer` → desarmá la última page agrupada en esta sesión (no las pages existentes que vinieron del matcheo) y volvé al paso 4.
- `cancelar` → confirmá con `vscode/askQuestions` y, si confirma, borrá `.autoflow/recordings/{numero}-*` y `{specPath}`, y volvé al menú.

### Validaciones

Antes de generar:

1. `n` debe ser exactamente el primer paso de "Nuevo". Si no, respondé corto: `"Tenés que arrancar por el paso {primero-de-nuevo}."` y volvé a esperar.
2. `m >= n` y `m` no puede pasarse del último paso del recording.
3. El nombre debe ser PascalCase válido (sin espacios, sin acentos en ASCII estricto). Si trae espacios, normalizalos a PascalCase y mostrale al QA cómo quedó antes de generar.
4. No puede chocar con un nombre de page existente. Si choca, decilo y pedí otro nombre.

## 6. Generar el PO de la nueva page

Cuando el comando es válido:

1. **Leé `.autoflow/conventions/pom-rules.md`** primero (sí, todas las veces).
2. Generá `pages/{NombrePage}.ts` (PascalCase, mismo nombre que la clase, con sufijo `Page`) siguiendo las reglas. Ej: clase `AccesoFimaPage` → archivo `pages/AccesoFimaPage.ts`. Selectores priorizados según la regla. **El JSDoc de la clase queda corto** (1-2 líneas describiendo la pantalla en español, sin listar acciones).
3. **Materializá los nodos del rango**:
   - Para cada nodo crudo del rango asignado a esta page, calculá su `id = {NombrePage}::{accion}::{selector}`.
   - Para `fill`/`press`/`selectOption`, si el `valor` parece dato variable (input del usuario, no UI fija), reemplazalo por `*` antes de armar el nodo a guardar.
   - Actualizá `.autoflow/nodos.json` (creá el archivo si no existe). Por cada id: si no está, agregalo con `{ id, page, accion, selector, selectorRaw, valor?, confiabilidad, matcher? }`. Si ya está, dejalo como está (no sobreescribir).
   - **Asserts** del rango: también van a `nodos.json` con su id. Si el assert es a nivel page (`selector="page"`), su id usa la **page activa** al momento del paso → en este rango, la page que estás generando.
   - **Ids únicos**: el id es determinístico (`{page}::{accion}::{selector}`). Si dos nodos del recording producen el mismo id es porque el selector normalizado los colapsa — eso es intencional (es la misma acción). **Nunca uses sufijos `_1`/`_2`** para desambiguar; si te pasa, frená y avisá: probablemente hay un bug en el normalizador del parser.
4. Generá el sidecar `.autoflow/fingerprints/{NombrePage}.json` con el shape `{ page, nodos: [...], asserts: [...], conecta: [...] }` documentado en `pom-rules.md`:
   - `nodos[]`: ids de **acciones del usuario** del rango (no asserts), en orden. Si el id se repite consecutivamente (mismo nodo dos veces seguidas), incluilo una sola vez.
   - `asserts[]`: ids de los `assert` del rango, en orden. **No participan del matcheo de prefijo**.
   - `conecta[]`: vacío por ahora — se completa en el paso 6.5.
   - Si el sidecar ya existía (page reusada por matcheo), enriquecelo: sumá ids nuevos a `asserts[]` sin duplicar; `nodos[]` se respeta tal cual estaba (el matcheo confirmó que el flujo es el mismo).
5. **Persistí el grupo** en `.autoflow/recordings/{numero}-grupos.json` (creá el archivo si no existe; appendeá al array `rangos`):
   ```json
   { "rangos": [{ "page": "LoginPage", "desde": 1, "hasta": 7 }, { "page": "AccesoFima", "desde": 8, "hasta": 10 }] }
   ```
   Esto persiste qué nodos del recording quedaron asignados a qué page, y lo usa el script `generar-traza.js` al cierre. **No se lo muestres al QA.**
6. **Asserts**: si entre los pasos del rango hay alguno tipo `assert`, mapealos dentro del PO. Si el assert es sobre un locator que ya está como `private readonly`, sumá un método `verificar{Algo}()` que haga `await expect(this.<locator>).<matcher>(...)`. Si el locator solo aparece en el assert, declaralo igual como `private readonly` y usalo desde el método de verificación. Asserts a nivel `page` (`toHaveURL`, `toHaveTitle`) van también dentro de un método `verificar{Algo}()` usando `this.page`.
7. Inferí el método público a partir de la cadena de acciones del usuario:
   - `fill` + `fill` + `click(verbo)` → método con verbo y parámetros para los fills (ej: `ingresar(usuario, password)`).
   - `click` aislado con texto descriptivo → método con verbo (`abrirNuevaInversion()`).
   - Si no hay nombre claro, usá `realizarPaso{N}()` y dejá un comentario `// FIXME: renombrar al integrar.`.
8. Si la última acción navega a otra pantalla, dejá el método retornando `Promise<void>` por ahora (la siguiente page todavía no existe; cuando se cree, se ajusta).
9. Volvé al paso 4 y mostrá el listado actualizado: la page recién creada va con ✅ y sus pasos también. **Reimprimí el listado entero** — todos los pasos del recording, del primero al último, sin abreviar (regla del paso 4).

> Cada agrupación es una iteración. Nunca generes más de una page por turno: agrupás → generás → mostrás de nuevo → esperás el próximo comando.

## 6.5. Enriquecer el grafo de conexiones

Después de cualquier iteración del paso 6 (sea page nueva o no), revisá la **secuencia de pages** del recording (incluyendo las existentes que matchearon en el prefix matching). Ej: el flujo grabado fue `LoginPage → CelularesPage → CarritoPage`.

Para cada par contiguo `A → B` en esa secuencia:

1. Leé `.autoflow/fingerprints/{A}.json`.
2. Si `B` no está en `A.conecta`, sumalo (sin duplicar).
3. Guardá el JSON.

Esto va construyendo un grafo dirigido de pages que después se usa para visualizaciones y para arrancar grabaciones desde estados intermedios. Hacelo **callado**: no le anuncies al QA que actualizaste el grafo a menos que se lo agregues a una page que ya tenía conexiones (en ese caso, una línea: `Sumé {B} a las conexiones de {A}.`).

Después de actualizar los `conecta`, **regenerá los dos diagramas Mermaid** ejecutando con `runCommands`:

```
node .autoflow/scripts/grafo.js
node .autoflow/scripts/grafo-nodos.js
```

Eso reescribe `.autoflow/grafos/grafo.md` (grafo de pages) y `.autoflow/grafos/grafo-nodos.md` (grafo de nodos coloreado por confiabilidad). Si alguno de los scripts falla (por ejemplo, todavía no hay fingerprints), seguí adelante igual — no es bloqueante. También callado salvo error. **Nunca te saltes el de nodos** — es la herramienta principal de análisis del flujo del usuario.

## 7. Elegir / crear test set

Cuando ya no hay pasos en "Nuevo", **antes** de generar el spec, hay que asociar el caso a un test set. Nunca lo dejes suelto.

1. Listá los archivos en `.autoflow/testsets/*.json`.
2. Abrí `vscode/askQuestions` single-select: `"¿En qué test set va este caso?"` con:
   - cada test set existente como opción (mostrá `{nombre} (ID {id})`)
   - `➕ Crear nuevo test set` al final
3. **Si elige uno existente**: anotá su `slug` e `id`.
4. **Si elige crear nuevo**: usá `vscode/askQuestions` con tres inputs en una sola llamada (carousel):
   1. `"¿Cómo se llama el test set?"` → text input (ej: `Regresion de compras`)
   2. `"Test Set ID"` → text input (ej: `44534`)
   3. `"Descripción corta"` → text input

   Generá `slug` desde `nombre` en **camelCase**: sin acentos, primera palabra minúscula, resto capitalizado, sin separadores. Ej: `Regresion de compras` → `regresionDeCompras`. Si `.autoflow/testsets/{slug}.json` ya existe, pedí otro nombre.

## 8. Cierre — generar el test

1. Mostrá la propuesta:
   ```
   📋 Pages cubiertas:
     • LoginPage
     • OverviewPage
     • AccesoFima           (nueva)
     • ConfirmarSuscripcion (nueva)

   Test set → "{nombre}" (ID {id})
   Test     → tests/{slug}-{id}.spec.ts
   ```
2. Abrí `vscode/askQuestions` single-select: `"¿Confirmas que agregue el test en el Test set?"`:
   - `✅ Sí, generarlo`
   - `✏️ Rehacer alguna page` → volvé al paso 4 con la opción `rehacer`
3. Si confirma:
   - El path del spec es **siempre** `tests/{slug}-{id}.spec.ts` (uno por test set, no por caso).

   ### 8.a. Extraer datos a `data/` — OBLIGATORIO ANTES DE ESCRIBIR EL SPEC

   **Aplica siempre, sin excepciones, tanto si el test set es nuevo como existente.** Los specs **nunca** llevan literales de input. La estructura tiene dos capas (ver `pom-rules.md` → "Datos de prueba"):

   - `data/usuarios.ts` — catálogo de usuarios reusables (interface `User`).
   - `data/data-{slug}.ts` — datos del test set, referenciando a `usuarios`.

   El spec **solo importa `data{PascalSlug}` del archivo del test set**, nunca `usuarios` directo. La composición usuario+datos vive en el archivo del test set.

   Pasos, en este orden:

   **(1) Identificar y separar los literales del recording**
   - Recorré los argumentos de `fill`, `press`, `selectOption`. Ignorá los strings de UI fija (títulos, labels, nombres de botones) — esos viven en locators del PO.
   - Clasificá cada literal en dos baldes:
     - **Datos de usuario**: usuario, contraseña, DNI. (En el flujo típico viene de los primeros `fill` del login.) También incluí el `canal` del caso (que ya tenés en `session.json`).
     - **Datos del test**: importes, búsquedas, productos, cuentas destino, fechas, todo lo demás.

   **(2) Cargar / actualizar `data/usuarios.ts`**
   - Si el archivo no existe, creá:
     ```typescript
     import type { User } from './types';

     export const usuarios = {} as const satisfies Record<string, User>;
     ```
     y asegurate de que `data/types.ts` exporte `interface User { canal: string; user: string; pass: string; dni?: string; }`. Si tampoco existe, creá `types.ts` también.
   - Para el usuario del recording: si ya existe una entrada con el mismo `user` + `canal`, **reusala**. Si no, **agregá una nueva entrada** con key `{escenario}{Canal}` en camelCase (ej: `qaIcbcEstandar`, `clienteVipDemoblaze`). Pedile al QA por `vscode/askQuestions` con un text input cuál es el escenario que describe a este usuario, sugiriendo `qaEstandar` por default.
   - **Importante**: el password en homologación queda en texto plano en el repo. Confirmar con el QA que el usuario es de homologación antes de commitearlo.

   **(3) Crear / actualizar `data/data-{slug}.ts`**
   - Naming: `data-{slug}.ts` donde `{slug}` es el slug del test set en camelCase (mismo que el spec).
   - Si no existe, creá:
     ```typescript
     import { usuarios } from './usuarios';

     export const data{PascalSlug} = {
       loginPrincipal: usuarios.{keyDelUsuario},
     } as const;
     ```
   - Sumá los datos del test del balde (2): `importeTransferencia`, `productoBuscado`, etc. Las keys describen el rol del dato en el flujo, no el valor.
   - **Números planos, sin separadores**: si el recording capturó `'100.000'` o `'1,000'` (porque el QA tipeó así en el form), guardalo en el data file como `100000` (sin punto, sin coma, sin guion bajo, **como `number`** si es claramente un valor numérico). Si el form requiere el separador para aceptar el valor, formatealo en el `fill` del PO con `String(monto).replace(...)` — el data file siempre tiene el número crudo.
   - Si el caso es nuevo en un test set existente: enriquecé el `data-{slug}.ts` que ya está, sin romper las keys que ya usaban otros casos.

   **(4) Re-exportar desde `data/index.ts`**
   - Sumá `export * from './types';`, `export * from './usuarios';`, `export * from './data-{slug}';` si todavía no están.

   **Checklist pre-escritura** (mental, no se lo muestres al QA): antes de llamar a `edit` para escribir el spec, releé el bloque que vas a escribir y confirmá que NO contiene comillas con datos de input — solo destructurings desde `data{PascalSlug}`. Si encontrás un literal ahí, frená y volvé al paso 8.a.3.

   ### 8.b. Escribir el spec

   - **Si el test set es nuevo** (el archivo spec no existe):
     - Creá `tests/{slug}-{id}.spec.ts` con el header de imports (`import { test, expect } from '../fixtures'; import { data{PascalSlug} } from '../data';`) y un primer bloque `test('TC-{numero} {nombre}', ...)` encadenando las pages en orden. **Nada de clases base.** Destructurá `data{PascalSlug}` arriba del test para que las referencias queden cortas.
     - Creá `.autoflow/testsets/{slug}.json` con el shape de `crear-test-set.md` paso 3, incluyendo `id` y el path del spec en `casos`.
   - **Si el test set es existente** (el archivo spec ya existe):
     - **No crees un archivo nuevo**. Editá `tests/{slug}-{id}.spec.ts` y agregá un nuevo bloque `test('TC-{numero} {nombre}', ...)` al final, antes del cierre del archivo. Reusá los imports que ya estén — `data{PascalSlug}` ya debería estar importado.
     - El JSON del test set ya tiene el path en `casos`; no hace falta tocarlo.
   - Si hace falta, agregá fixtures a `fixtures/index.ts` (pero **datos no van en fixtures**, van en `data/`).

## 9. Generar la traza del recording — OBLIGATORIO

**Inmediatamente después de escribir el spec** (paso 8.b) y **antes** del resumen final, generá la traza ejecutando con `runCommands`:

```
node .autoflow/scripts/generar-traza.js {numero}
```

El script lee `.autoflow/recordings/{numero}-parsed.json` + `.autoflow/recordings/{numero}-grupos.json` + `.autoflow/nodos.json` y emite `.autoflow/recordings/{numero}-path.json` con la secuencia de ids de nodo visitados (incluyendo asserts) en el orden del recording.

**Si el script falla** (típicamente porque falta `grupos.json` o porque hay un nodo sin page asignada), **frená el flujo** y avisá al QA: probablemente algún paso del recording no se agrupó. No avances al resumen ni a la limpieza hasta resolver. Esto es intencional: la traza es el output de mayor valor analítico del flujo, perderla por un olvido del agente sería costoso.

## 10. Limpieza

Una vez que `path.json` existe (verificá su existencia antes de borrar nada), borrá los archivos temporales:
- `.autoflow/recordings/{numero}-parsed.json`
- `.autoflow/recordings/{numero}.spec.ts`
- `.autoflow/recordings/{numero}-grupos.json` (ya cumplió su función al alimentar el script de traza)

**Mantené** como historial:
- `.autoflow/recordings/{numero}-session.json` (con `activa: false`)
- `.autoflow/recordings/{numero}-path.json` (traza de nodos)

## 11. Resumen final

```
✅ Listo. Generé:

  • pages/AccesoFimaPage.ts
  • pages/ConfirmarSuscripcionPage.ts
  • tests/regresionDeCompras-44534.spec.ts

Reusé:
  • pages/LoginPage.ts
  • pages/OverviewPage.ts

Test set: "{nombre}" (ID {id}) {nuevo|actualizado}.
```

Abrí `vscode/askQuestions` single-select: `"¿Qué hacemos?"`:
- `▶️ Correrlo ahora` → dispará la VSCode task **`autoflow:run-test-headed`** con el path del test. Corre con navegador visible (`--headed --workers=1`) para que el QA vea la prueba que acabamos de grabar ejecutándose en pantalla.
- `🏠 Volver al menú`
