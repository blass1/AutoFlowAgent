# Manual de uso — AutoFlow

Guía de uso diario del agente. Si es la primera vez, arrancá por **🚀 Primeros pasos**. Si ya conocés lo básico y querés algo concreto, andá directo a la sección que corresponde con el ícono.

---

## 🚀 Primeros pasos

### Lo que necesitás antes de arrancar

- **VS Code 1.109+** con la extensión **GitHub Copilot Chat** actualizada.
- Setting `chat.askQuestions.enabled` habilitado (suele venir por defecto).
- Plan **Copilot Business** o **Enterprise**.
- **Node 18+** (verificá con `node --version`).

### Cómo arrancar el agente

1. Abrí Copilot Chat (Ctrl+Shift+I en Windows / Cmd+Shift+I en Mac).
2. En el dropdown arriba del input, elegí el chat mode **AutoFlow**.
3. Decile *"hola"*.

La **primera vez** detecta si faltan `node_modules` o los browsers de Playwright y te guía para instalarlos. Después hace un onboarding corto: te pregunta nombre, legajo, equipo y tribu. Esos datos quedan en `.autoflow/user.json` y se usan para registrar quién creó cada Test. Si necesitás cambiarlos después, podés hacerlo desde la sección **👤 Mi perfil** del dashboard.

A partir de ahí cada sesión arranca directo en el menú principal.

### Si te trabás

- **No aparece el chat mode AutoFlow en el dropdown**: actualizá la extensión Copilot Chat. Si seguís sin verlo, fijate que `.github/chatmodes/autoflow.chatmode.md` exista en el repo y reabrí VS Code.
- **El agente dice "no encuentro node_modules"**: corré `npm install && npx playwright install chromium` y volvé a hablarle.
- **Aparece el banner ASCII pero después no responde nada**: probablemente el setting `chat.askQuestions.enabled` está deshabilitado. Activalo en Settings de VS Code.

---

## 🧭 El menú en 2 niveles

El menú principal tiene **5 categorías** (nivel 1). Al elegir una, se abre un sub-menú con sus acciones puntuales (nivel 2). Tras completar una acción siempre volvés al nivel 1, no al sub-menú — punto de pivote estable.

### 🖥️ Abrir dashboard

Acción directa, sin sub-menú. Genera y abre el dashboard del proyecto en tu navegador. Lo usás cuando querés navegar visualmente Test Sets, Tests, pasos, ejecuciones o el grafo del flujo, o cuando querés editar tu perfil de Usuario.

### 🧪 Tests

Las 3 acciones core que más vas a usar:

- **✨ Crear** — grabar un caso nuevo desde cero (manual o desde Export ALM).
- **✏️ Editar** — modificar un Test ya grabado: regrabar, editar código, añadir pasos al final, insertar nodos especiales (capturar/verificar), o bifurcar.
- **▶️ Correr** — ejecutar un Test puntual con UI mode.

### 📦 Test Sets

Un **Test Set** es un agrupador de Tests (un archivo `tests/{slug}-{id}.spec.ts` con varios `test()` adentro envueltos en un `test.describe`).

- **📦 Crear** — agrupar Tests existentes en un set, o crear uno vacío.
- **🔧 Editar** — agregar/quitar Tests, renombrar, cambiar descripción, eliminar.
- **🚀 Correr** — correr toda la regresión del set. Pregunta headed (visual, secuencial) o headless (paralelo, rápido).

### 📄 ALM

Integración con tu sistema ALM:

- **📥 Importar .xlsx y crear Test** — atajo a la rama "desde Export ALM" del flujo de crear caso. Te ahorra tipear nombre/TC a mano si ya los tenés en ALM.
- **📤 Exportar Test a ALM** — toma un Test ya grabado y emite un xlsx (o csv/json) con el paso a paso (Test ID, Test Name, Step Name, Description, Expected Result) listo para subir a tu ALM.

### 🛠️ Mantenimiento

Tareas para mantener saludable la suite:

- **🪄 Auto-Health Node** — sanea locators débiles antes de que rompan en CI.
- **📊 Cobertura de Nodos** — reporte HTML con qué nodos están cubiertos por qué Tests, y qué pages tienen 0 cobertura.
- **🔐 Login reusable** *(experimental)* — graba un storageState reusable para que los siguientes Tests arranquen ya logueados.
- **🔧 Utilidades** — aplica/desaplica librerías complementarias que dejaste en `utils/`.

---

## 🎬 Tu primer Test (tutorial)

El tutorial canónico. Vas a grabar un caso de prueba completo y dejarlo corriendo.

### Paso 1 — Decirle al agente qué querés hacer

Menú principal → **🧪 Tests → ✨ Crear**.

### Paso 2 — Datos del caso

El agente pregunta:

- **¿Cómo querés cargar los datos del caso?** — `📄 Importar desde Export ALM (.xlsx)` o `✍️ Cargar manualmente`. Para tu primer caso, manual es lo más rápido.
- **Nombre del caso, número (testId), canal** — el canal se elige de un catálogo reusable (`data/urls.ts`); si no está, podés crear uno nuevo en el momento.
- **¿Arranca logueado?** — si ya configuraste un login reusable para ese canal (vía 🔐 Login reusable), podés elegirlo y saltearte el login en la grabación. Si no, decile "no".
- **¿Buffer de tiempo de 500ms entre inputs?** — recomendado para forms con validación on-input que se solapa al tipear rápido. Si tu front es responsivo, podés decir no.

### Paso 3 — Confirmar y grabar

El agente lanza Chromium con el Inspector de Playwright. **El chat queda bloqueado** mientras grabás. Navegá tu flujo end-to-end. Cuando termines, **cerrá el browser**.

### Paso 4 — Confirmar que terminaste

Cuando vuelve el control, el agente te pregunta `"¿Ya terminaste de grabar el flujo completo y cerraste el browser?"`. Esto es un safeguard: si decís "no, todavía estoy grabando", te espera y vuelve a preguntar. Si decís "sí" pero el archivo del recording todavía no aparece (race condition de filesystem), el agente reintenta varias veces antes de declarar fallo.

### Paso 5 — Limpieza pre-agrupado

Antes de procesar, el agente te muestra **todos los pasos capturados** y te ofrece borrar los que no querés (clicks accidentales, hovers de paso, asserts ruidosos). Tildá los que querés eliminar; los demás siguen al flujo. Si no hay nada para borrar, dejá el multi-select vacío y seguís.

### Paso 6 — Agrupación en Page Objects

El agente analiza los pasos y los matchea contra Page Objects existentes (prefix matching). Te muestra:

```
✅ LoginPage          (pasos 1–3, 3 nodos)
✅ OverviewPage       (paso 4, 1 nodo)

— Nuevo —
   Paso 5: 👆 click en "Nueva inversión"  [4/5]
   Paso 6: 👆 click en "Confirmar"        [4/5]
```

Las pages reusadas van colapsadas con ✅. Los pasos bajo `— Nuevo —` los agrupás vos: escribís `<rango> <NombrePage>`, ej: `5-6 ConfirmarInversion`. El agente:

- Si el nombre **ya existe** como Page Object: te pregunta si querés reusar un método existente (te muestra similitud), agregar un método nuevo dentro de esa Page, o cambiar el nombre.
- Si es nombre nuevo: genera el archivo `pages/{NombrePage}.ts` siguiendo las convenciones, el sidecar y suma los nodos.

### Paso 7 — Test Set destino

Cuando ya no quedan pasos en `— Nuevo —`, el agente pregunta a qué **Test Set** asociar este caso. Si es el primer Test, creá uno nuevo (te pide nombre, id, descripción).

### Paso 8 — Resumen y correrlo

Te muestra qué generó: pages nuevas, pages reusadas, archivo del spec, Test Set. Te ofrece correrlo en modo headed para verlo en pantalla. Decile que sí.

---

## 🧱 Conceptos clave

Si entendés estos 5 conceptos, entendés AutoFlow.

### Nodo

La **unidad atómica del flujo**. Cada acción del recording (click, fill, goto, assert, hover...) es un Nodo con id determinístico:

```
LoginPage::click::getByRole:button:Ingresar
```

Formato: `{Page}::{accion}::{selector}`. **El mismo nodo en distintas grabaciones colapsa al mismo id**. Esto permite responder cross-recording: "qué Tests usan este botón", "qué nodos no toca nadie".

Cada nodo tiene **confiabilidad de 1 a 5** según el tipo de locator:

| Confiabilidad | Locator | Cuándo |
|---|---|---|
| 5 | `getByTestId` | Lo más sólido |
| 4 | `getByRole({ name })` | Accesible y semántico |
| 3 | `getByLabel` | Forms etiquetados |
| 2 | `getByPlaceholder` / `getByText` | Frágil ante cambios de copy |
| 1 | `locator(...)` CSS | Frágil ante refactors del front |

La confiabilidad se ve en el dashboard, en el grafo de nodos, y en el listado del agente al agrupar. Es deuda visible **antes** de que rompa.

### Page Object

Una clase TypeScript en `pages/{Nombre}Page.ts` que encapsula los locators y métodos de una pantalla. Cada Page Object tiene un sidecar en `.autoflow/fingerprints/{Nombre}.json` con la lista ordenada de ids de sus nodos. Ese sidecar es la huella que usa el agente para reconocer el flujo en grabaciones futuras.

### Test

Un bloque `test('{nombre} [testId:{numero}]', ...)` dentro de un spec. Tiene sus pasos en `test.step('comentario', async () => { ... })` para que el reporter los muestre como sub-pasos colapsables.

### Test Set

Un agrupador de Tests. Vive en dos lugares:

- `.autoflow/testsets/{slug}.json` — metadata (nombre, id, casos).
- `tests/{slug}-{id}.spec.ts` — un único `test.describe('{nombre} [testSetId:{id}]', () => { ... })` con todos los `test()` adentro.

### Traza

`.autoflow/recordings/{numero}-path.json` — la secuencia de ids visitados por un Test. Sobrevive a la grabación. Se usa para análisis de cobertura, para bifurcar Tests, y para Auto-Health Node (saber dónde se usa cada Nodo).

---

## 🩹 Cuando algo no anda

Tabla de **síntoma → flujo** para los problemas más típicos.

| Síntoma | Qué hacer |
|---|---|
| Un Test pasaba y empezó a fallar — el front cambió un selector | Correr el Test → en el menú post-fallo elegir `🧩 Actualizar Nodos sospechosos`. Tildás los que creés que cambiaron y elegís `🪄 Capturar DOM y proponer` (el agente captura el DOM real y propone un locator más confiable) o `✍️ Pegar a mano`. |
| Querés mejorar locators frágiles **antes** de que rompan | Menú → `🛠️ Mantenimiento → 🪄 Auto-Health Node`. Lista los nodos con confiabilidad ≤3 ordenados por fragilidad y por cantidad de Tests que los usan. |
| El login con OTP se hace eterno cada vez que grabás | Menú → `🛠️ Mantenimiento → 🔐 Login reusable`. Lo grabás una vez y los siguientes Tests del mismo canal arrancan ya logueados. |
| El Test cuelga 30s y falla con timeout sin explicación | Mirá si tu PO usa `waitForLoadState('networkidle')` — en sites con long-polling/analytics/WebSocket persistente nunca se cumple. Cambialo a `'domcontentloaded'` (default actual). |
| El agente dice "no encuentro el archivo del recording" pero vos lo ves en la carpeta | El agente tiene retry (3 intentos × 1.5s) para race conditions de filesystem. Si igual falla, te muestra el listado real del directorio y te ofrece confirmar manualmente con `✅ Confirmo que el archivo está, seguí`. |
| Hay grabaciones zombi (sesiones marcadas activas pero el browser ya se cerró) | Al activar el chat mode, `setup-entorno.md` las detecta automáticamente (>30 min con `activa: true`) y te ofrece retomarlas, cerrarlas, o dejarlas como están. |
| El dashboard muestra `0 Test Sets · 0 Tests` aunque tenés Tests | Regenerá el dashboard: `npm run dashboard`. Es estático, se actualiza solo cuando lo corrés. |
| Las pages se duplicaron — tenés `LoginPage` y `LoginPage2` | Es un caso de colisión que se resolvió mal en una grabación pasada. Editá a mano: mové los métodos de `LoginPage2` a `LoginPage`, actualizá los imports en los specs y el sidecar, y borrá `LoginPage2.ts`. |

---

## 🍴 Avanzado

Cuando dominás lo básico, estas funcionalidades te ahorran más tiempo.

### Bifurcar un Test desde un Nodo

Útil cuando ya tenés un Test que llega hasta cierto punto del flujo (ej: login + navegar al producto) y querés crear otro que arranque desde ahí. En lugar de regrabar todo:

1. Menú → `🧪 Tests → ✏️ Editar` → elegís el Test fuente → `🍴 Bifurcar Test desde un Nodo`.
2. El agente lista los `test.step` del Test fuente — elegís el step de corte.
3. Genera un **warm-up** que ejecuta el prefix usando los métodos del PO existentes y guarda `storageState` en el punto exacto.
4. Lanza codegen con `--load-storage` apuntando a la URL del nodo de corte. Vos solo grabás la cola.
5. El agente arma el Test nuevo: prefix copiado del fuente + tail recién agrupado.

**Limitación honesta**: `storageState` captura cookies + localStorage + sessionStorage, **no** estado in-memory (forms a medio llenar, modales abiertos). Si el nodo de corte está mid-form, el agente te avisa y te ofrece elegir otro punto.

### Nodos especiales: capturar y verificar

Cuando un caso necesita validar que un valor del DOM cambió de manera específica (ej: "el saldo disminuyó después de transferir"):

- **`capturar`** — lee un valor en un punto del flujo y lo guarda en una variable per-test.
- **`verificar`** — vuelve a leer y compara contra una variable previa o un literal, según una condición (`igual`, `distinto`, `aumentó`, `disminuyó`, `aumentó al menos N`, `aumentó al menos N%`, etc.).

Se insertan **después** de grabar, desde `Editar → Insertar Nodo de captura/verificación`. Para armar el locator hay 4 caminos:

1. **🔧 Abrir Chrome hasta el paso N** — el agente abre el browser pausado en el punto exacto.
2. **📋 HTML + intent** — pegás el HTML y describís qué querés extraer; el agente arma el locator.
3. **🔁 Reusar locator existente** — del recording.
4. **✍️ Pegar selector Playwright** — si ya lo tenés.

### Importar / Exportar ALM

- **📥 Importar**: dejás el `.xlsx` exportado de tu ALM en `.autoflow/alm-exports/`, elegís `📄 ALM → Importar .xlsx y crear Test`, el agente lee testId, nombre y enfoque del archivo y arranca codegen sin que tipees nada a mano.
- **📤 Exportar**: el agente toma un Test ya grabado y emite un archivo (xlsx default, csv o json) con un row por cada `test.step`. Granularidad: un Test por archivo. Útil para subir a ALM via API o import manual.

### Utilidades (plugin loader)

Si tenés librerías auxiliares (un reporter custom, un hook de notificación, helpers) podés ponerlas en `utils/` y enchufarlas al proyecto vía `🛠️ Mantenimiento → 🔧 Utilidades`. Cada utilidad se autodescribe con un header tipo `@autoflow-util` que el agente parsea para entender dónde aplicarla y cómo. Idempotente: aplicar dos veces no duplica nada. Convención completa en [utils/README.md](../../utils/README.md).

### Buffer de tiempo (anti-solape)

Algunos forms del banco tienen validación on-input asíncrona. Si el siguiente keystroke llega antes de que la validación termine, los eventos se solapan y el campo queda en estado raro. Al crear un Test, el agente pregunta si activar un buffer de 500ms post cada `pressSequentially`. Recomendado encender para forms con validators agresivos.

---

## ❓ Troubleshooting

Errores específicos y cómo destrabarlos.

### "El agente dice que no hay sesión activa"

Pasa cuando hiciste `node clearSession.js` o cuando una sesión vieja se cerró pero quedó marcada incorrectamente. Solución: arrancá un caso nuevo (`🧪 Tests → ✨ Crear`) y el agente la crea por vos.

### "Codegen abre Chromium pero la URL no carga"

Mirá si la URL del canal en `data/urls.ts` está bien. También puede ser que el banco bloquee tu IP — probá levantar la VPN si aplica.

### "El test corre pero falla en la primera línea con `selector strict mode violation`"

Tu selector matchea más de un elemento. El agente debería haber capturado un selectorRaw específico (con `.first()` / `.nth(N)` / `.filter(...)`). Si no, abrí el PO y agregá el chain a mano. El "audit" te lo va a mostrar como confiabilidad baja la próxima vez.

### "Cobertura dice 0 nodos cubiertos pero corrí los tests"

Cobertura usa las **trazas** (`{numero}-path.json`), no los runs reales. Las trazas se generan al **grabar** un Test, no al correrlo. Si no ves nada cubierto, regenerá las trazas o regrabá los Tests.

### "Quiero borrar todo y empezar de cero"

```bash
node clearSession.js
```

Te pide confirmación (escribir `SI`). Borra grabaciones, fingerprints, testsets, nodos.json, pages/, tests/, data/data-*.ts. **No toca** scripts, prompts, conventions, fixtures, configs, ni `utils/`.

### "El dashboard no se actualiza con cambios recientes"

Es estático. Cada vez que querés ver lo último, corré `npm run dashboard` (o `🖥️ Abrir dashboard` desde el menú).

### "Quiero ver los logs de una corrida que falló"

Después de un fallo, el agente ofrece `📊 Re-correr con trace y abrir reporte HTML`. Eso dispara la corrida con `--reporter=html --trace=on` y abre `npx playwright show-report` cuando termina. Ahí tenés trace, screenshots y stack trace.

---

> Si encontrás algo que no está en este manual o un error al usar el agente, comentalo en el chat y se actualiza. El manual vive en `.autoflow/scripts/dashboard-manual.md` — editalo libremente.
