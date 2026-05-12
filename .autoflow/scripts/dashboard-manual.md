# Manual de uso — AutoFlow

Guía práctica para automatizar casos de prueba con el agente. Cada sección de abajo es un flujo del menú con su paso a paso. Si querés algo concreto, andá directo a la sección correspondiente desde el TOC.

---

## 🚀 Primeros pasos

### Lo que necesitás

- **VS Code 1.109+** con la extensión **GitHub Copilot Chat** actualizada.
- Setting `chat.askQuestions.enabled` habilitado (suele venir por defecto).
- Plan **Copilot Business** o **Enterprise**.
- **Node 18+** (verificá con `node --version`).

### Cómo arrancar

1. Abrí Copilot Chat (Ctrl+Shift+I en Windows / Cmd+Shift+I en Mac).
2. En el dropdown arriba del input, elegí el chat mode **AutoFlow**.
3. Decile *"hola"*.

La **primera vez** te pide nombre, legajo, equipo y tribu — quedan en `.autoflow/user.json`. Si necesitás cambiarlos después, lo hacés desde la sección **👤 Mi perfil** del dashboard.

A partir de ahí cada sesión arranca directo en el menú principal.

---

## 🧭 El menú

Top-level plano con 9 opciones. Solo `📄 ALM-HP` y `🛠️ Mantenimiento` abren un sub-menú; el resto va directo al sub-flujo. `📦 Crear o Modificar un Test-Set` te pregunta inline si querés crear uno nuevo o modificar uno existente.

| Opción | ¿Sub-menú? | Qué hace |
|---|---|---|
| `✨ Crear un Nuevo Test Automatizado` | no | grabar un caso de prueba nuevo desde cero |
| `✏️ Modificar o Extender un Test existente` | no | regrabar, editar código, añadir pasos, bifurcar, insertar nodo... |
| `🪄 Mejorar un Test (Auto-Health Node)` | no | sanear locators débiles capturando el DOM real |
| `📦 Crear o Modificar un Test-Set` | pregunta inline | crear nuevo · modificar existente |
| `▶️ Ejecutar un Test (Individual)` | no | un spec puntual con `--grep=\[testId:N\]` |
| `🎯 Ejecutar un Test-Set (Grupal)` | no | regresión completa headed o headless |
| `📄 Application Lifecycle Management (ALM-HP)` | sí | importar xlsx · exportar a ALM |
| `🖥️ Abrir Dashboard del proyecto actual` | acción directa | abre `.autoflow/dashboard.html` en el browser |
| `🛠️ Mantenimiento` | sí | validar trazas · cobertura · login reusable · utilidades |

Tras completar una acción, siempre volvés al **top-level** (no al sub-menú desde el que viniste). Punto de pivote estable.

---

## 🧪 Crear un Test

**Cuándo usarlo**: querés grabar un caso de prueba nuevo desde cero.

### Pasos

1. **Menú → ✨ Crear un Nuevo Test Automatizado**.

2. **¿Cómo cargás los datos?**
   - `📄 Importar desde Export ALM (.xlsx)` — si ya tenés el caso en ALM, dejás el `.xlsx` en `.autoflow/alm-exports/` y el agente lee testId, nombre y enfoque automáticamente.
   - `✍️ Cargar manualmente` — escribís nombre y testId a mano.

3. **Pide datos del caso** (carrousel):
   - Nombre del caso (ej: "Compra de dolar mep con CA")
   - Número/testId
   - Canal — single-select de los canales conocidos (`data/urls.ts`) o opción para crear uno nuevo.

4. **¿Arranca logueado?**
   Si para ese canal hay un `auth/{canal}-{user}.json` configurado, te ofrece elegirlo. Decí "sí" si querés saltearte el login y "no" si querés grabarlo.

5. **¿Buffer anti-solape de 500ms?**
   Recomendado **sí** si el front del banco tiene validators on-input que se solapan al tipear rápido. **No** si el front es responsivo.

6. **Confirmás y el agente lanza Chromium** con el grabador. **El chat queda bloqueado** mientras grabás.

7. **Grabás tu flujo** end-to-end. Cuando termines, **cerrás el browser**.

8. **El agente vuelve y te pregunta**: `"¿Ya terminaste de grabar?"`. Esto es un safeguard contra retornos prematuros — solo decí `Sí` cuando efectivamente cerraste el browser.

9. **Limpieza pre-agrupado**:
   El agente te muestra todos los pasos que capturó y te ofrece **borrar los no deseados** (clicks accidentales, hovers de paso, asserts ruidosos). Tildá los que querés eliminar y confirmá. Si no hay nada para borrar, dejá vacío y seguí.

10. **Agrupación de pasos en Page Objects**:
    El agente te muestra el listado de pasos pendientes bajo `— Nuevo —` (las pages que ya existían las marca con ✅ colapsadas). Vos escribís rangos:
    ```
    1-3 LoginPage
    4 OverviewPage
    5-7 AccesoFima
    ```
    Por cada agrupación, el agente genera el `pages/{Nombre}Page.ts`, el sidecar (`fingerprints/{Nombre}.json`) y los nodos.
    
    **Si elegís un nombre que ya existe**: el agente compara el rango de pasos contra los métodos del PO existente. Te ofrece **reusar un método** (si los pasos son muy parecidos), **agregar un método nuevo** dentro del PO existente, o **cambiar el nombre** si era casualidad.

11. **Asociás el Test a un Test Set**:
    `single-select` con los Test Sets existentes + opción `➕ Crear nuevo`. Si es nuevo, te pide nombre, id y descripción.

12. **El agente genera todo**:
    - `pages/*.ts` (POs nuevos)
    - `tests/{slug}-{id}.spec.ts` (spec con `test.describe` + `test.step`)
    - `data/data-{slug}.ts` (interface + datos del Test Set, autocontenido)
    - `nodos.json` actualizado
    - sidecars de las pages
    - `{numero}-path.json` (la traza)
    - regenera los grafos (una sola vez al final)

13. **Te ofrece correrlo headed** para ver la prueba que acabás de grabar ejecutándose en pantalla.

### Tips

- **Hacé clicks claros, sin doble-tap accidental**. El parser ya filtra Ctrl+C/V, pero clicks dobles los toma como dos pasos.
- **Si tu canal tiene login con OTP**: configurá primero un **Login reusable** (Mantenimiento → 🔐) antes de crear casos. Te ahorra tipear el OTP en cada grabación.
- **Si el flujo tiene un date picker o filtrar una fila de tabla**: terminá la grabación normal, después usá **Editar Test** para insertar esos pasos parametrizados (más abajo).
- **Si querés bifurcar desde otro Test existente** en lugar de regrabar: usá **Editar Test → 🍴 Bifurcar**.

### Si algo sale mal

- **El agente dice que no encuentra el archivo de la grabación pero vos lo ves**: race condition de filesystem. El agente reintenta 3 veces; si igual falla, te muestra el listado real del directorio y te ofrece confirmar manualmente con `✅ Confirmo que está, seguí`.
- **El agente no genera la traza**: el flujo se cortó antes del paso 9. Andá a **Mantenimiento → 🧬 Validar / Regenerar trazas** — si los inputs siguen, el script la regenera; si no, hay que regrabar.

---

## ▶️ Correr un Test

**Cuándo usarlo**: querés ejecutar un Test puntual y ver el resultado.

### Pasos

1. **Menú → ▶️ Ejecutar un Test (Individual)**.
2. Elegís el **Test Set** que contiene el Test.
3. Elegís el **Test** dentro del set.
4. Confirmás y el agente dispara la corrida con `--headed` (browser visible) y `--grep=\[testId:N\]` (filtra al Test elegido — el spec contiene todos los Tests del set, sin el grep correrías todos).

### Lectura del resultado

- ✅ **Pasó** → te ofrece correr otro Test, repetir, o volver al menú.
- ❌ **Falló** → te ofrece varias acciones:
  - `🔄 Volver a correr` (reintentar tal cual).
  - `🧩 Actualizar Nodos sospechosos` → sub-flow para reparar locators rotos. Lista los nodos del Test ordenados por confiabilidad ascendente y por cada uno te ofrece **`🪄 Capturar DOM y proponer`** (Auto-Health) o **`✍️ Pegar a mano`** el locator nuevo.
  - `📊 Re-correr con trace y abrir reporte HTML` → vuelve a correr con `--debug` (suma `--reporter=html --trace=on`) y abre el reporte de Playwright con screenshots, trace y stack.
  - `🔍 Ver el error completo` → te muestra el output del terminal.
  - `📝 Abrir el Test para editar`.

### Tips

- **Default es rápido**: `--reporter=line`, sin trace ni HTML report. Ideal para corridas iterativas.
- **Para investigar un fallo**, andá siempre por `📊 Re-correr con trace y abrir reporte HTML` — es la única forma de ver paso a paso qué pasó.
- **Si el Test no existe en el dashboard**: chequea **Validar / Regenerar trazas** (Mantenimiento). Probablemente la traza no se generó.

---

## ✏️ Editar un Test

**Cuándo usarlo**: necesitás modificar un Test existente. El menú de edición tiene 7 sub-opciones — usás la que corresponda.

### Cómo entrar

**Menú → ✏️ Modificar o Extender un Test existente**. Elegís Test Set → Test → la acción de abajo.

### 🔄 Regrabar desde cero

**Cuándo**: el flujo cambió mucho y conviene partir de cero.

El agente lee el spec actual (URL inicial, canal, etc.), te confirma los datos, y delega a **Crear Test** desde el paso 3 — saltea las preguntas que ya sabe.

### 📝 Editar el código manualmente

**Cuándo**: querés ajustes finos al código (renombrar un método, agregar un wait específico, ajustar un selector verbatim).

El agente abre en VSCode el spec + todos los Page Objects que el Test usa. Lo editás a mano. **Después** correlo con `▶️ Correr` para verificar.

### ➕ Añadir pasos al final del Test

**Cuándo**: necesitás extender el flujo (más pasos al final), sin tocar lo que ya está.

Te ofrece dos modos:
- **🎬 Regrabar desde el final** → marca `modo: "append"` en la sesión y lanza el grabador apuntando a la URL final del Test. Vos navegás solo los pasos nuevos, cerrás el browser, y el agente mergea los pasos al spec existente reusando los Page Objects que ya hay (matchea contra los sidecars).
- **🧱 Construir paso a paso (HTML + acción)** → flujo manual sin volver a navegar. Pegás el HTML del elemento target, elegís la acción (click, fill, hover, etc.), el agente arma el locator y lo agrega al PO.

### 🎯 Insertar Nodo de captura/verificación

**Cuándo**: necesitás validar que un valor del DOM cambió de manera específica (ej: "el saldo disminuyó después de transferir").

Hay dos tipos de Nodo especial:
- **`capturar`** — lee un valor en un punto del flujo y lo guarda en una variable per-Test.
- **`verificar`** — vuelve a leer (mismo selector u otro) y compara contra una variable previa o un literal, según una condición (`igual`, `distinto`, `aumentó`, `disminuyó`, `aumentó al menos N`, `aumentó al menos N%`, etc.).

**Pasos**:
1. Elegís en qué punto del flujo insertar (después de qué paso).
2. Tipo: `capturar` o `verificar`.
3. Si `capturar`: nombre de la variable.
4. Cómo armar el locator — 4 caminos:
   - **🔧 Abrir Chrome hasta el paso N** → el agente genera un spec temporal que ejecuta los pasos hasta el punto y termina con `page.pause()`. Se abre el Inspector de Playwright; vos usás "Pick locator" o copiás outerHTML con DevTools.
   - **📋 HTML + intent** → pegás el HTML y describís qué querés extraer (ej: "el saldo en pesos de la cuenta CA"). El agente arma el locator robusto.
   - **🔁 Reusar locator existente** del recording.
   - **✍️ Pegar selector Playwright** que ya tenés.
5. Parser del valor: `text` / `number` / `currency-arg` / `date`.
6. Si `verificar`: contra qué comparar (variable capturada o literal) y la condición.
7. Confirmás y el agente edita el PO + spec + nodos.json + sidecar atómicamente.

### 🎯 Acción filtrada en lista

**Cuándo**: tenés que operar sobre **un item específico** de una lista/tabla que cumple criterios concretos. Ejemplos:
- Click en los 3 puntitos de "la suscripción Fima de hoy con monto $100.000" → `Cancelar`.
- Validar que existe un plazo fijo de fecha=hoy + monto=X.
- Validar que NO existe un movimiento de fecha=ayer (porque se canceló).

**Por qué**: el grabador captura por posición (`nth(2)`); si mañana cambia el orden, el test agarra otra fila. Este flujo arma un **filtro por contenido** que es robusto.

**Pasos**:
1. Elegís el punto de inserción.
2. Tipo de acción:
   - `🎯 Click en menú de la fila` (3 puntitos + submenú).
   - `✓ Validar que la fila exista`.
   - `🚫 Validar que la fila NO exista`.
3. Pegás el HTML de la lista (con 2-3 filas para que el agente vea la estructura repetitiva).
4. Definís hasta **5 criterios de filtro**: nombre del criterio (`fecha`, `monto`, `nombreFondo`...), tipo TS (`string`, `number`, `Date`), valor de ejemplo. **Cada criterio se vuelve un parámetro del método**.
5. Si es click+menú: pegás el HTML del submenú (los 3 puntitos abiertos) y elegís qué opción se clickea.
6. Confirmás. El agente arma:
   ```ts
   async cancelarSuscripcionFima(fecha: string, monto: number): Promise<void> {
     const fila = this.page.getByRole('row')
       .filter({ hasText: fecha })
       .filter({ hasText: String(monto) });
     await fila.getByRole('button', { name: 'Más opciones' }).click();
     await this.page.getByRole('menuitem', { name: 'Cancelar suscripción' }).click();
     await this.page.waitForLoadState('domcontentloaded');
   }
   ```
7. **Origen de cada criterio**: del data file (sumá el campo nuevo), calculado al vuelo (ej: fecha de hoy), o literal hardcodeado.

### 📅 Elegir fecha en date picker

**Cuándo**: necesitás elegir una fecha en un selector y quere parametrizarla (no clavarla al día capturado por el grabador).

**Pasos**:
1. Elegís el punto de inserción.
2. Tipo de date picker:
   - `📅 Input nativo HTML5 (<input type="date">)`.
   - `📆 Calendario custom` (con header de mes + botones de día + nav).
   - `🔤 Input typeable` (escribís + dropdown).
3. Pegás el HTML del picker (con header del mes si es custom).
4. Formato: `Date object` o `string` con formato específico (`dd/mm/yyyy`, `yyyy-mm-dd`, etc.).
5. Si es custom: cómo se ve el header del mes (ej: `mayo 2026`, `Mayo de 2026`).
6. Nombre del método (ej: `elegirFechaVencimiento`) y del parámetro (`fecha`).
7. Origen del valor: del data file, calculado al vuelo (hoy, +30 días, próximo viernes, custom), o literal.
8. Confirmás y el agente arma el método. Para el custom hace un loop: navega meses comparando el header hasta llegar al objetivo, después click en el día.

**Tip**: si el calendario custom tiene un formato de header inusual, el helper `parsearHeader` puede necesitar ajuste manual después. El agente te avisa en el cierre.

### 🍴 Bifurcar Test desde un Nodo

**Cuándo**: tenés un Test que llega hasta cierto punto del flujo (login + navegar al producto) y querés crear otro que arranque desde ahí, sin regrabar todo.

**Pasos**:
1. Elegís el Test fuente.
2. Elegís el **step de corte** (el agente lista los `test.step` del Test fuente; vos elegís después de cuál querés bifurcar).
3. Datos del Test nuevo: nombre, testId nuevo.
4. Test Set destino: el mismo del Test fuente, otro existente, o uno nuevo.
5. El agente genera un **warm-up** en `tests/_temp/`: ejecuta los steps 1..N del prefix llamando a los métodos del PO original, y al final guarda el `storageState` (cookies + localStorage + sessionStorage) en el punto de corte.
6. Lanza el grabador con `--load-storage` apuntando a la URL del nodo de corte. **Vos solo grabás la cola** — el prefix ya quedó hecho.
7. Cerrás el browser. El agente confirma que terminaste.
8. El agente arma el Test nuevo: prefix copiado del Test fuente + tail recién agrupado, todo en el mismo `test()` con sus instancias arriba.

**Limitación honesta**: `storageState` captura cookies/localStorage/sessionStorage, **no** estado in-memory (forms a medio llenar, modales abiertos, JS state). Si el step de corte está mid-form, el agente te avisa y te ofrece elegir otro punto.

---

## 📦 Test Sets

### 📦 Crear Test Set

**Cuándo**: querés agrupar Tests para correr regresiones completas.

**Pasos**:
1. **Menú → 📦 Crear o Modificar un Test-Set → ➕ Crear un Test-Set nuevo**.
2. Carrousel: nombre del set (ej: "Regresión de Plazos Fijos"), id (ej: `12345`), descripción.
3. Multi-select: elegís Tests existentes para mover al set (cada Test vive en un solo Test Set; al moverlo se borra del spec original). O `📭 Crear vacío` para arrancar sin Tests.
4. Confirmás. El agente crea:
   - `.autoflow/testsets/{slug}.json` con metadata + lista de casos.
   - `tests/{slug}-{id}.spec.ts` con el `test.describe('{nombre} [testSetId:{id}]', () => { ... })` listo para recibir Tests.

### 🔧 Editar Test Set

**Cuándo**: necesitás agregar/quitar Tests, renombrar el set, cambiar la descripción.

Single-select de acciones disponibles:
- Mover un Test a este set (desde otro o desde "casos sueltos").
- Mover un Test fuera del set.
- Renombrar / cambiar id / cambiar descripción.
- Eliminar el set entero (te confirma; preserva los specs si elegís).

### 🚀 Correr Test Set

**Cuándo**: querés correr toda la regresión.

**Pasos**:
1. **Menú → 🎯 Ejecutar un Test-Set (Grupal)**. Elegís el set.
2. Validación pre-corrida: `validar-coherencia.js` chequea specs faltantes, sidecars con ids inexistentes, POs sin sidecar. Si hay errores te frena antes de gastar tiempo.
3. **Headed o headless?**
   - `🎬 Headed (ver el browser, secuencial)` — recomendado para validar visualmente. Workers=1.
   - `⚡ Headless (rápido, paralelo)` — recomendado para regresiones grandes. Usa los workers default del config.
4. Corre y reporta totales.

### Lectura del resultado

- ✅ **Todos pasaron** → te ofrece correr otro set o volver al menú.
- ❌ **Algunos fallaron** → te muestra cuáles y te ofrece:
  - `▶️ Correr solo los que fallaron` (rearma el grep).
  - `🧩 Actualizar Nodos sospechosos de un caso` (te pregunta cuál si hay varios).
  - `📊 Re-correr con trace y abrir reporte HTML`.
  - `🔍 Ver el primer error en detalle`.

---

## 📄 ALM

### 📥 Importar .xlsx y crear Test

**Cuándo**: ya tenés el caso cargado en ALM y querés ahorrarte tipear nombre/TC a mano.

**Pasos**:
1. Exportá el caso desde ALM y dejá el `.xlsx` en `.autoflow/alm-exports/`.
2. **Menú → 📄 Application Lifecycle Management (ALM-HP) → 📥 Importar .xlsx y crear un Test**.
3. Te pide el nombre del archivo (o ruta completa). El script lee:
   - A2 → testId
   - C2 → nombre del caso
   - G2 → enfoque de prueba
4. El agente confirma con vos y, si hace falta, te deja editar nombre/testId. Después solo te pregunta el canal y arranca el grabador (saltea las preguntas iniciales del flujo de Crear Test).

### 📤 Exportar Test a ALM

**Cuándo**: tenés un Test ya grabado y querés generar un archivo para subir a ALM (xlsx por defecto).

**Pasos**:
1. **Menú → 📄 Application Lifecycle Management (ALM-HP) → 📤 Exportar Test automatizado a ALM**.
2. Elegís Test Set → Test → formato (`xlsx` recomendado, `csv` o `json` también).
3. El script genera un archivo en `.autoflow/alm-exports/{slug}-testId-{N}-{ts}.{ext}` con un row por cada Nodo de la traza:

   | Test ID | Test Name | Step Number | Step | Description | Expected Result |
   |---|---|---|---|---|---|
   | 43213 | Compra de dolar... | 1 | Navegar | Navegar a https://... | La página solicitada se carga correctamente. |
   | 43213 | Compra de dolar... | 2 | Click | Hacer click en el campo "Usuario" | El campo "Usuario" se acciona correctamente. |
   | 43213 | Compra de dolar... | 3 | Llenar campo | Ingresar el valor correspondiente en el campo "Usuario" | El campo "Usuario" muestra el valor ingresado. |
   | ... | | | | | |
   | 43213 | Compra de dolar... | 7 | Validar visibilidad | Validar que el título "Bienvenido" sea visible en pantalla | El título "Bienvenido" se muestra correctamente. |

4. Description y Expected están **humanizadas** en castellano — pensadas para que un QA pueda leer el archivo en ALM y recrear el caso a mano sin tener que mirar código.

**Tip**: si te dice `❌ No encuentro la traza`, andá a **Mantenimiento → 🧬 Validar / Regenerar trazas** primero.

---

## 🛠️ Mantenimiento

### 🪄 Auto-Health Node

**Cuándo**: querés sanear locators frágiles **antes** de que rompan en CI.

**Pasos**:
1. **Menú → 🪄 Mejorar un Test (Auto-Health Node)** *(ahora en el top-level, ya no dentro de Mantenimiento)*.
2. El agente lista los Nodos con confiabilidad ≤3 ordenados por fragilidad + cantidad de Tests que los usan (los más frágiles y más usados arriba).
3. Elegís uno.
4. El agente identifica en qué Test se usa, genera un spec efímero en `tests/_temp/` que ejecuta el flujo hasta el paso anterior, y captura el DOM del elemento (elemento + 7 ancestros, fallback a body completo si el locator está completamente roto).
5. Razona sobre el HTML capturado y propone un locator más confiable, priorizando `getByTestId` > `getByRole+name` > `getByLabel` > etc.
6. Te muestra "antes/después" con la confiabilidad delta:
   ```
   Locator actual:    getByText('Continuar')                [2/5]
   Locator propuesto: getByTestId('btn-continuar')          [5/5]
   ```
7. Confirmás y aplica atómicamente: PO + nodos.json (con `deprecated: true, reemplazadoPor`) + sidecar.

**Tip**: solo aplica si la confiabilidad mejora. Si no encuentra mejor, te avisa y no toca nada.

### 🧬 Validar / Regenerar trazas

**Cuándo**: el dashboard muestra Tests sin pasos, exportar-alm falla con `❌ No encuentro la traza`, o querés un audit pre-demo.

**Pasos**:
1. **Menú → 🛠️ Mantenimiento → 🧬 Validar / Regenerar trazas**.
2. El agente corre `validar-trazas.js`. Reporta 4 categorías:
   - `ok`: trazas que existen y están bien.
   - `regenerado`: trazas que faltaban pero se regeneraron desde `parsed.json` + `grupos.json`.
   - `fallido`: tienen inputs pero `generar-traza.js` falla (típicamente drift entre `nodos.json` y los grupos — Nodos deprecated sin reemplazo).
   - `irrecuperable`: sin inputs, hay que regrabar.
3. Para los `fallido` te ofrece cargar `actualizar-nodos.md` (probablemente hay deprecated sin reemplazo).
4. Para los `irrecuperable` te ofrece borrar las sesiones huérfanas.

**Idempotente**: corrérlo varias veces no rompe nada.

### 📊 Cobertura de Nodos

**Cuándo**: querés saber qué del producto está testeado de verdad.

**Pasos**:
1. **Menú → 🛠️ Mantenimiento → 📊 Cobertura de Nodos**.
2. El agente corre `cobertura.js` que agrega todas las trazas y emite un HTML interactivo en `.autoflow/grafos/cobertura.html`.
3. El HTML muestra:
   - Qué nodos están cubiertos y por qué Tests.
   - Qué nodos no pisa nadie (código muerto).
   - % de cobertura por Page Object.
   - Grafo de pages coloreado de **rojo (0%)** a **verde (100%)**.

### 🔐 Login reusable (experimental)

**Cuándo**: el banco tiene login con OTP y volver a hacerlo cada grabación es un dolor.

**Pasos**:
1. **Menú → 🛠️ Mantenimiento → 🔐 Login reusable**.
2. Single-select: grabar nuevo / refrescar uno existente / borrar uno / volver.
3. Si grabás nuevo: elegís canal y usuario (escaneados de los `data/data-*.ts` o cargados a mano).
4. El agente lanza Chromium. Te logueás (incluyendo OTP si aplica) y cerrás el browser cuando estés del otro lado del login.
5. El estado queda en `.autoflow/auth/{canal-slug}-{userKey}.json` (gitignored, sensible).
6. La próxima vez que crees un caso en ese canal, el agente detecta el auth y te pregunta si arrancás logueado.

**Reduce un caso de "12 pasos (login + OTP + flujo)" a "2 pasos (solo flujo)"** cuando ya tenés el auth.

### 🔧 Utilidades

**Cuándo**: tenés librerías auxiliares (reporting custom, hooks de notificación, helpers) que querés enchufar al proyecto.

**Pasos**:
1. Pones tu archivo en `utils/` con un header convencional (ver `utils/README.md` para el shape de los tags `@autoflow-util`, `@descripcion`, `@aplicarEn`, `@como-aplicar`, etc.).
2. **Menú → 🛠️ Mantenimiento → 🔧 Utilidades**.
3. El agente lista las utilidades disponibles con su estado (aplicada / no aplicada / sin instrucciones).
4. Tildás las que querés aplicar/desaplicar.
5. Por cada una: el agente te muestra las instrucciones literales del header + un preview de los cambios concretos. Confirmás y aplica idempotentemente.

**Reglas**: el agente nunca toca archivos sin confirmación, no duplica imports/hooks (idempotente), y frena si las instrucciones del header son ambiguas.

---

## 🖥️ Dashboard

**Cuándo usarlo**: para tener una vista visual del estado del proyecto. Lo abrís desde **Menú → 🖥️ Abrir dashboard** o con `npm run dashboard`.

### Lo que vas a encontrar

**Sidebar (izquierda)**:
- 👤 **Mi perfil** — editás tus datos del `user.json` (el agente actualiza el archivo cuando le pegás el prompt al chat).
- 📖 **Manual de uso** — esta misma guía.
- **Test Sets** expandibles a Tests. Cada Test tiene una **page-bar** debajo: una barra horizontal coloreada que muestra qué Pages toca (un segmento por Page, en orden de visita).

**Vista principal (derecha)**:
- **Test Set seleccionado** → 3 tabs: Detalles (descripción + grilla de Page Objects con métricas: locators, métodos, nodos, # de Tests que lo usa, confiabilidad promedio), Tests, Ejecuciones.
- **Test seleccionado** → 4 tabs: Detalles (canal, sesión, origen ALM si aplica), Pasos (cada paso con su confiabilidad y color por Page), Grafo (Mermaid agrupado en `subgraph` por Page), Ejecuciones.

### Modal de Nodo

Si hacés click en un paso o en un nodo del grafo, se abre un modal con la info del Nodo (id, page, accion, selector, selectorRaw, confiabilidad, deprecated) y 4 acciones:
- **📂 Abrir en VSCode** → deep link a la línea exacta del locator en el PO.
- **📋 Copiar prompt: actualizar Nodo** → copia al portapapeles un prompt listo para pegar en el chat (`actualizar-nodos.md`).
- **🍴 Bifurcar Test desde acá** → copia un prompt para bifurcar el Test desde este Nodo.
- **🪄 Auto-Health (capturar DOM)** → copia un prompt para sanear el locator del Nodo.

### Tip importante

El dashboard es **estático** — se actualiza solo cuando lo regenerás. Cada vez que querés ver lo último, corré `npm run dashboard` o entrá desde el menú.

---

## ❓ Troubleshooting

| Síntoma | Qué hacer |
|---|---|
| El agente dice "no encuentro el archivo del recording" pero vos lo ves en la carpeta | Race condition de filesystem. El agente reintenta 3 veces antes de declarar fallo. Si igual falla, te muestra el listado real y te ofrece confirmar manualmente con `✅ Confirmo que está, seguí`. |
| El dashboard muestra Tests sin pasos | La traza no se generó. Andá a `🛠️ Mantenimiento → 🧬 Validar / Regenerar trazas`. Si los inputs siguen, el script la regenera. |
| Un Test pasaba y empezó a fallar — el front cambió un selector | Correr el Test → menú post-fallo elegí `🧩 Actualizar Nodos sospechosos`. Tildás los que creés que cambiaron y elegís `🪄 Capturar DOM y proponer` (recomendado) o `✍️ Pegar locator a mano`. |
| Querés mejorar locators frágiles antes de que rompan | `🪄 Mejorar un Test (Auto-Health Node)` (top-level del menú). |
| El login con OTP se hace eterno cada vez que grabás | `🛠️ Mantenimiento → 🔐 Login reusable`. Lo grabás una vez y los siguientes Tests del mismo canal arrancan ya logueados. |
| El Test cuelga 30s y falla con timeout sin explicación | Probable que tu PO use `waitForLoadState('networkidle')` en un site con long-polling/analytics persistente. Cambialo a `'domcontentloaded'` (que es el default actual). Para Tests viejos podés migrar a mano. |
| Hay grabaciones zombi (sesiones marcadas activas pero el browser cerrado) | Al activar el chat mode, `setup-entorno.md` las detecta automáticamente (>30 min con `activa: true`) y te ofrece retomarlas, cerrarlas, o dejarlas como están. |
| Querés un audit completo del estado del proyecto | `npm run audit` → corre `validar-coherencia.js` + `validar-trazas.js --solo-audit` en cascada. Punto único de "está todo OK". |
| Las pages se duplicaron (`LoginPage` y `LoginPage2`) | Caso de colisión que se resolvió mal en una grabación pasada. Editá a mano: mové los métodos de `LoginPage2` a `LoginPage`, actualizá los imports en los specs y el sidecar, borrá `LoginPage2.ts`. |
| El grep no filtra el Test correctamente al correr | El bug de PowerShell escapando mal los corchetes. Asegurate que el comando use `--grep=\[testId:N\]` (forma `=` sin quotes), no `--grep "\[testId:N\]"`. |
| Quiero borrar todo y empezar de cero | `node .autoflow/clearSession.js` (pide confirmación con `SI`). Borra grabaciones, fingerprints, testsets, nodos.json, pages, tests, data/data-*.ts. **No toca** scripts, prompts, conventions, fixtures, configs, ni `utils/`. |
| Quiero ver una corrida headless rápida vs headed visual | Al correr un Test Set te pregunta. Headed = secuencial con browser visible (validar visualmente). Headless = paralelo con workers default (regresiones grandes). |
| El export a ALM tiene rows técnicas en vez de humanizadas | Probable que estés usando una versión vieja del script. Verificá que `exportar-alm.js` lea la traza (`{testId}-path.json`) y genere un row por Nodo, no por `test.step`. |

---

> Si encontrás algo que no está cubierto en este manual, comentalo en el chat. El manual vive en `.autoflow/scripts/dashboard-manual.md` — editalo libremente, el dashboard lo lee al regenerarse.
