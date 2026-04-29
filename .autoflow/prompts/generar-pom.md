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
node scripts/parse-codegen-output.js {numero}
```

El script produce `.autoflow/recordings/{numero}-parsed.json` con la lista ordenada de pasos. Cada paso tiene la forma:

```json
{
  "indice": 1,
  "tipo": "fill",                        // fill | click | press | check | uncheck | selectOption | goto
  "selector": "getByLabel:Usuario",      // firma normalizada
  "valor": "qa.test",                    // solo en fill/press/selectOption
  "descripcion": "Rellena el campo \"Usuario\""
}
```

Si el script falla o no existe, leé directamente `.autoflow/recordings/{numero}.spec.ts` y derivá la lista a mano siguiendo el mismo shape.

## 3. Reconocer pages existentes (prefix matching)

1. Listá los archivos `pages/**/*Page.ts`.
2. Para cada uno, parseá el JSDoc de la clase y extraé el bloque `@autoflow-fingerprint`. El formato está documentado en `.autoflow/conventions/pom-rules.md`. Cada línea es `acción | selector | valor opcional`. Para `valor`, `*` es comodín (matchea cualquier valor).
3. Recorré los pasos del recording de izquierda a derecha y, mientras quede prefijo sin asignar, intentá matchear el prefijo contra cada fingerprint conocido. Una page matchea si **todos** sus pasos coinciden en orden con el prefijo actual del recording (acción exacta, selector exacto, valor literal o `*`). Si matchea, esos pasos quedan asignados a esa page existente y avanzás. Si ninguna matchea, parás y todo lo que sigue queda en `-Nuevo-`.
4. Pages sin fingerprint (POs viejos previos a esta convención) **no participan** del matcheo automático.

> Solo prefijo: una vez que hubo un paso "Nuevo", todos los siguientes son nuevos también, aunque más adelante vuelvan a aparecer pasos de una page conocida. Esto es intencional para mantener el flujo predecible.

## 4. Mostrar el listado y explicar la sintaxis

Mostrale al QA un mensaje con esta estructura. Las pages existentes aparecen con `✅` y sus pasos también con `✅`. La frontera con lo no agrupado es `-Nuevo-` (sin tilde). Los pasos nuevos van numerados y sin tilde.

```
Estos son los pasos que capturé. Los que ya están en pages existentes
los marqué con ✅. Los de abajo de "Nuevo" tenés que agruparlos vos.

✅ LoginPage
   ✅ Paso 1: Rellena el campo "Usuario"
   ✅ Paso 2: Rellena el campo "Contraseña"
   ✅ Paso 3: Click en botón "Ingresar"

✅ OverviewPage
   ✅ Paso 4: Click en botón "Inversiones"

— Nuevo —
   Paso 5: Click en botón "Nueva inversión"
   Paso 6: Click en botón "Fondos Fima"
   Paso 7: Click en botón "Fima Premium"
   Paso 8: Click en botón "Suscribir"

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

## 5. Recibir el comando de agrupación

El QA tipea libre. Esperá uno de estos formatos:

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
2. Generá `pages/{NombrePage}.ts` (PascalCase, mismo nombre que la clase, con sufijo `Page`) siguiendo las reglas. Ej: clase `AccesoFimaPage` → archivo `pages/AccesoFimaPage.ts`. Selectores priorizados según la regla, fingerprint en el JSDoc del header (con `*` en cualquier valor que sea dato variable: usuarios, montos, etc.).
3. Inferí el método público a partir de la cadena de acciones:
   - `fill` + `fill` + `click(verbo)` → método con verbo y parámetros para los fills (ej: `ingresar(usuario, password)`).
   - `click` aislado con texto descriptivo → método con verbo (`abrirNuevaInversion()`).
   - Si no hay nombre claro, usá `realizarPaso{N}()` y dejá un comentario `// FIXME: renombrar al integrar.`.
4. Si la última acción navega a otra pantalla, dejá el método retornando `Promise<void>` por ahora (la siguiente page todavía no existe; cuando se cree, se ajusta).
5. Volvé al paso 4 y mostrá el listado actualizado: la page recién creada va con ✅ y sus pasos también.

> Cada agrupación es una iteración. Nunca generes más de una page por turno: agrupás → generás → mostrás de nuevo → esperás el próximo comando.

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
2. Abrí `vscode/askQuestions` single-select: `"¿Genero el test?"`:
   - `✅ Sí, generarlo`
   - `✏️ Rehacer alguna page` → volvé al paso 4 con la opción `rehacer`
3. Si confirma:
   - El path del spec es **siempre** `tests/{slug}-{id}.spec.ts` (uno por test set, no por caso).
   - **Si el test set es nuevo** (el archivo spec no existe):
     - Creá `tests/{slug}-{id}.spec.ts` con el header de imports y un primer bloque `test('{nombre del caso TC-{numero}}', ...)` usando fixtures de `fixtures/index.ts` y encadenando las pages en orden. **Nada de clases base.**
     - Creá `.autoflow/testsets/{slug}.json` con el shape de `crear-test-set.md` paso 3, incluyendo `id` y el path del spec en `casos` (un único entry, ya que hay un solo spec por set).
   - **Si el test set es existente** (el archivo spec ya existe):
     - **No crees un archivo nuevo**. Editá `tests/{slug}-{id}.spec.ts` y agregá un nuevo bloque `test('{nombre del caso TC-{numero}}', ...)` al final, antes del cierre del archivo. Reusá los imports y fixtures que ya estén; sumá los que falten al inicio.
     - El JSON del test set ya tiene el path en `casos`; no hace falta tocarlo (sigue habiendo un solo spec).
   - Si hace falta, agregá fixtures a `fixtures/index.ts`.

## 9. Resumen final

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

## 10. Limpieza

Borrá los archivos temporales:
- `.autoflow/recordings/{numero}-parsed.json`
- `.autoflow/recordings/{numero}.spec.ts`

**Mantené** como historial:
- `.autoflow/recordings/{numero}-session.json` (con `activa: false`)
