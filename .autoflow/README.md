# `.autoflow/` — Estado y configuración del agente

Este directorio contiene los **prompts del agente AutoFlow**, sus **convenciones de código**, y el **estado runtime** de las grabaciones, fingerprints, nodos, trazas y test sets.

## Estructura

```
.autoflow/
├── prompts/                # sub-prompts que el agente carga según la acción del QA
├── conventions/
│   └── pom-rules.md        # reglas que el agente sigue al generar POMs y tests
├── scripts/                # parser, generador de traza, scripts de grafo, runners
│   └── lib/                # helpers compartidos entre scripts (render-html, etc.)
├── recordings/             # archivos generados durante una sesión de grabación
├── fingerprints/           # un sidecar JSON por page con nodos[], asserts[], conecta[]
├── testsets/               # un JSON por test set
├── alm-exports/            # xlsx exportados desde ALM, fuente para "crear caso" desde ALM
├── auth/                   # storageState .json para login reusable (gitignored)
├── captures/               # HTML + intent + razonamiento de cada nodo capturar/verificar
├── grafos/                 # diagramas Mermaid (.md) y vista interactiva (.html)
├── consolegraph/           # banner ASCII que el agente muestra al arrancar
├── nodos.json              # diccionario global de nodos (fuente de verdad)
├── user.json               # datos del QA (creado en el onboarding, no se commitea)
└── user.json.example       # ejemplo del shape de user.json
```

## Qué se commitea y qué no

**Sí** se commitean:
- `prompts/`, `conventions/`, `scripts/`, este README, `user.json.example`, los `.gitkeep` de las carpetas runtime.
- `fingerprints/`, `testsets/`, `nodos.json` y `grafos/` — son los assets del proyecto que el equipo va construyendo.

**No** se commitea (ya está en `.gitignore`):
- `user.json` — identidad personal del QA.
- `recordings/*` — estado efímero de grabaciones (excepto el `.gitkeep`).
- `auth/*.json` — storageState con tokens de sesión sensibles.
- `alm-exports/*.xlsx` — exports propietarios del usuario.

## Archivos de una sesión de grabación

Cuando el QA arranca "Crear caso" y graba el flujo, se generan en `recordings/`:

| Archivo | Qué tiene | Persiste al final |
| --- | --- | --- |
| `{numero}-session.json` | Metadata de la sesión + flag `activa: true/false` | Sí (historial) |
| `{numero}.spec.ts` | Output crudo de `playwright codegen` | No (temporal) |
| `{numero}-parsed.json` | Nodos crudos parseados del spec | No (temporal) |
| `{numero}-grupos.json` | Rangos `{ page, desde, hasta }` que el agente persiste mientras agrupa | **Sí** (lo necesita `validar-trazas.js` para regenerar `path.json` si se pierde) |
| `{numero}-path.json` | Traza del recording: secuencia de ids de nodo visitados | **Sí (histórico)** |

Los temporales se borran en el paso 10 de [prompts/generar-pom.md](prompts/generar-pom.md), pero solo después de verificar que `path.json` se generó correctamente.

## Estado del proyecto fuera de `recordings/`

| Archivo / carpeta | Qué tiene |
| --- | --- |
| `nodos.json` | Diccionario `{ id: nodo }` con todos los nodos conocidos. Cada id es `{page}::{accion}::{selector}`. Se enriquece con cada grabación; los nodos existentes no se sobreescriben. |
| `fingerprints/{Page}.json` | Sidecar de cada Page Object: `{ page, tipo, nodos: [id, ...], asserts: [id, ...], conecta: [destino, ...] }`. `nodos[]` es el **vocabulario** de la page (set de ids posibles) que usa `generar-pom.md` paso 3 para matchear nodo por nodo en grabaciones nuevas; `asserts[]` no participa del matcheo. **`tipo`**: `'page'` (default, omitible) o `'componente'` para navbars/headers/footers globales que viven fuera del flujo de navegación — el archivo del PO va sin sufijo (`pages/Navbar.ts`, no `pages/NavbarPage.ts`), `conecta` queda vacío y el matcheo evalúa el componente sin importar la page activa. |
| `testsets/{slug}.json` | Definición de cada test set (id, nombre, descripción, casos). |
| `alm-exports/` | xlsx exportados desde ALM. El QA suelta el archivo acá y `crear-caso.md` lo levanta vía `parse-alm-export.js` para prellenar nombre/TC/enfoque. |
| `auth/{canal-slug}-{userKey}.json` | StorageState (cookies + localStorage) post-login. Generado por `setup-auth.md`. Permite que los casos arranquen logueados sin re-grabar el login. **Sensible** — gitignored. |
| `captures/{numero}/{key}.json` | Por cada nodo `capturar`/`verificar` armado vía "HTML + intent": guarda el HTML pegado, el intent del QA, el locator propuesto, el final, y el razonamiento. Sirve para `actualizar-nodos.md` cuando el front cambia. |
| `grafos/grafo.md` · `grafo.html` | Grafo de pages (alto nivel). |
| `grafos/grafo-nodos.md` · `grafo-nodos.html` | Grafo de nodos coloreado por confiabilidad (1-5) y por tipo (capturar/verificar). |
| `grafos/cobertura.md` · `cobertura.html` | Cobertura de nodos: qué pisa cada test, qué nodos no pisa nadie, % por page. Generado por `cobertura.js`. |
| `runs/{timestamp}.json` | Historial de ejecuciones. Lo escriben `run-test.js` y `run-testset.js` en cada corrida. Lo lee el dashboard para mostrar la pestaña "Ejecuciones". **Gitignored** — es estado local del dev. |
| `dashboard.html` | Vista navegable del proyecto (Test Sets, Tests, pasos, ejecuciones, grafo). Generado por `dashboard.js`. **Gitignored** — se regenera bajo demanda. |
| `utils-applied.json` | Estado de las utilidades de `utils/` que están aplicadas al proyecto. Lo escribe `utilidades.md` cuando aplicás/desaplicás. Shape: `{ [nombreUtil]: { archivo, aplicadoEn, archivosTocados, carpetasCreadas } }`. **Sí se commitea** — el equipo necesita compartir qué utilidades están enchufadas. |

## Prompts disponibles

| Prompt | Para qué |
| --- | --- |
| `setup-entorno.md` | Se carga al activar el modo. Verifica `node_modules` y los browsers de Playwright, limpia specs viejos de `tests/_temp/` (>1 hora de antigüedad — basura de corridas que crashearon mid-flow), y detecta sesiones zombi (grabaciones con `activa: true` de hace > 30 min) preguntando al QA qué hacer. |
| `setup-auth.md` | Graba un `storageState` por (canal, usuario) en `.autoflow/auth/`. Sirve para que los casos arranquen logueados sin volver a grabar el login. |
| `onboarding.md` | Primer uso — pide nombre, legajo, equipo, tribu. |
| `menu-principal.md` | Menú de **2 niveles**. Nivel 1: 5 categorías — `🖥️ Dashboard` (acción directa), `🧪 Tests`, `📦 Test Sets`, `📄 ALM`, `🛠️ Mantenimiento`. Nivel 2: las acciones puntuales de cada categoría + `↩️ Volver`. **Cada label trae descripción inline** (ej: `🧪 Tests — crear, editar y correr casos puntuales`) para que el QA vea el contenido sin abrir el sub-menú. Tras completar una acción, siempre se vuelve al nivel 1. |
| `crear-caso.md` | Lanza grabación con codegen. Por default pregunta si los datos del caso vienen de un Export ALM (xlsx) o se cargan a mano. Acepta contexto opcional `origen: "alm"` (invocado desde el sub-menú ALM → Importar) u `origen: "manual"` para saltar esa pregunta y arrancar directo en el camino correspondiente. Después pregunta si arranca logueado (lista los `auth/*.json` del canal). |
| `editar-caso.md` | Regrabar / editar código / **añadir pasos al final del Test** (mergea pasos al final del `test()` existente reusando POMs) / insertar nodo de captura/verificación. |
| `insertar-nodo-especial.md` | Sub-flow invocado desde `editar-caso.md`. Inserta un nodo `capturar` o `verificar` en un caso existente. Para armar el locator ofrece 4 caminos: abrir Chrome hasta el paso N (`page.pause()`), pegar HTML + intent (el agente arma el locator), reusar un locator de un nodo existente, o pegar a mano. |
| `bifurcar-caso.md` | Sub-flow invocado desde `editar-caso.md` (o desde el botón "🍴 Bifurcar Test desde acá" del dashboard). Crea un **Test** nuevo a partir de un step de un **Test** existente: corre un warm-up que ejecuta el prefix y guarda `storageState`, después lanza el grabador con `--load-storage` para grabar sólo la cola, y materializa el nuevo `test()` con prefix copiado + tail recién agrupado. |
| `accion-en-lista.md` | Sub-flow invocado desde `editar-caso.md` para construir operaciones sobre items específicos de listas/tablas (cancelar la suscripción Fima de hoy, validar que existe un plazo fijo de monto X, etc.). Filtra la fila por **contenido** (combina hasta 5 `.filter({ hasText })`), no por posición — robusto a cambios de orden. Parametriza los criterios como args del método del PO. Soporta tres tipos de acción: **click + submenú** (3 puntitos + opción del menú), **validar existencia** (`expect(fila).toBeVisible()`), **validar no-existencia** (`expect(fila).toHaveCount(0)`). Pega un nodo nuevo con `accion: 'accionEnLista'` que lleva los criterios + el shape de la operación. |
| `elegir-fecha-en-picker.md` | Sub-flow invocado desde `editar-caso.md` para construir un método del PO que elige una fecha en un date picker, **parametrizado por la fecha** (no clavada al día capturado por el grabador). Soporta tres tipos: input nativo `<input type="date">` (fill ISO), calendario custom (navega meses comparando el header hasta llegar al objetivo, después click en el día), typeable (pressSequentially + Enter o click en sugerencia). La fecha viene del data file, calculada al vuelo (hoy, +30 días, etc.) o literal. Pega un nodo nuevo con `accion: 'elegirFecha'`. |
| `correr-caso.md` | Corre un caso puntual. |
| `crear-test-set.md` | Agrupa casos en un test set. |
| `editar-test-set.md` | Modifica un test set existente. |
| `correr-test-set.md` | Corre todos los casos de un set. |
| `generar-pom.md` | Post-grabación — matchea pages existentes, agrupa pasos, genera POMs, sidecars, nodos, traza y spec. **Limpieza pre-agrupado** (paso 2.5): multi-select para borrar pasos no deseados; los restantes se renumeran. **Matcheo por vocabulario** (paso 3): el sidecar se trata como set de ids posibles, no como secuencia de flujo, así pages como HomePage/LoginPage se reusan entre flujos parecidos aunque diverjan en algún paso del medio. Sigue `deprecated → reemplazadoPor`. **Pages no contiguas**: una misma page puede aparecer varias veces en el listado (ej: HomePage en pasos 1-2 y 8) — el sidecar acumula sin duplicar. **Componentes compartidos** (paso 5 validación 5): si el QA tipea `Navbar`/`Header`/`Footer`/`Sidebar`/`Topbar`, el agente marca `tipo: 'componente'` en el sidecar, genera el archivo sin sufijo `Page` (`pages/Navbar.ts`) y los métodos quedan llamables desde cualquier step sin importar la page activa. **Listado colapsado**: pages agrupadas en una línea, "Nuevo" completo. **Regrafos** una sola vez al final (paso 9.5). **Colisión de nombres** (paso 5.5) → delega en `pom-colision.md`. **Modo añadir pasos** (paso 0) → delega en `pom-append-grabado.md`. **Fusión por valor variable** (paso 8.a (4)): cuando el `name`/`label`/`text` de un selector coincide con un valor del data file (ej: producto), lo persiste como `*` y parametriza el método del PO — habilita reuso real entre flujos que cambian de dato. **Smoke test post-generación** (paso 11): después de escribir el spec ofrece correrlo headless; si falla, parsea el error y ofrece reparar el nodo afectado con Auto-Health Node sin volver al menú. |
| `pom-colision.md` | Sub-flow de `generar-pom.md` paso 5.5. Maneja el caso en que el QA elige un nombre de Page Object que ya existe: carga métodos públicos del PO existente, calcula similitud con el rango actual y ofrece **reusar método** (persiste `metodoReusado` en `grupos.json`), **agregar método nuevo a la Page existente** (persiste `metodoNuevo`), o **cambiar el nombre**. |
| `pom-append-grabado.md` | Sub-flow de `generar-pom.md` paso 0 — modo `session.modo === "append"`. Mergea pasos recién grabados al `test()` existente reusando locators y métodos de Page Objects ya conocidas, sin generar POs ni Test Sets nuevos. Distinto de `append-manual.md` (este último arranca de HTML pegado, sin grabar). |
| `actualizar-nodos.md` | Sub-flow invocado desde `correr-caso.md` / `correr-test-set.md` cuando un test falla. Por cada nodo a reparar, ofrece dos modos: (a) `🪄 Capturar DOM y dejar que el agente proponga` — delega a `auto-health-node.md`; (b) `✍️ Pegar locator a mano`. Marca el nodo viejo como `deprecated` y actualiza PO + sidecar + `nodos.json`. |
| `auto-health-node.md` | Sanea locators débiles **antes** de que rompan. Lista los nodos con confiabilidad ≤3 ordenados por fragilidad + cantidad de Tests que los usan. Para el elegido: genera un spec efímero en `tests/_temp/` que ejecuta el flujo del Test hasta el paso anterior, captura el DOM del elemento (elemento + 7 ancestros, fallback a `body.outerHTML` si el locator está completamente roto), y razona sobre el HTML para proponer un locator más confiable (priorizando `getByTestId` > `getByRole+name` > `getByLabel` > etc.). Solo propone si la confiabilidad mejora. Aplicación atómica como `actualizar-nodos.md`. Discoverable también desde el menú principal y desde el modal de Nodo del dashboard. |
| `validar-trazas.md` | Audita las trazas (`{numero}-path.json`) de todos los Tests grabados. Dispara `validar-trazas.js`, que reporta 4 categorías: `ok` (existen y están bien), `regenerado` (faltaban pero se rearmaron desde `parsed.json` + `grupos.json`), `fallido` (tienen inputs pero `generar-traza.js` falla — típicamente drift entre `nodos.json` y los grupos), `irrecuperable` (sin inputs, hay que regrabar). Útil cuando el dashboard muestra "sin traza" en Tests existentes, cuando exportar-alm falla, o como audit pre-demo. Discoverable desde el menú principal → Mantenimiento. |
| `exportar-alm.md` | Exporta un Test a un archivo importable por ALM. Pregunta Test Set → Test → formato (xlsx default, csv, json). Dispara `exportar-alm.js` que genera un row por cada `test.step` con Test ID, Test Name, Step Number, Step Name, Description (técnica, derivada del cuerpo del step) y Expected Result (de los `await expect(...)` o vacío). Granularidad: **un Test por archivo**. Output efímero en `.autoflow/alm-exports/{slug}-testId-{N}-{ts}.{ext}` (gitignored). |
| `utilidades.md` | Aplica/desaplica librerías complementarias del QA (`utils/*.ts` o `*.js`). Cada utilidad se autodescribe con tags en su header (`@autoflow-util`, `@descripcion`, `@aplicarEn`, `@como-aplicar`, `@verificar`, `@desinstalar`). El agente parsea el header, muestra el bloque `@como-aplicar` literal + un preview concreto de los cambios, pide confirmación por utilidad, e inyecta idempotente. Frena si las instrucciones son ambiguas. Estado en `.autoflow/utils-applied.json`. Convención completa en `utils/README.md`. |

## Scripts disponibles

| Script | Para qué |
| --- | --- |
| `start-recording.js` | Lanza `playwright codegen` con la URL de la sesión activa. Si la sesión tiene `authState`, agrega `--load-storage` para arrancar logueado. |
| `verificar-recording.js <numero>` | Chequeo robusto del .spec.ts del recording (existe + no está vacío). Lo usa `crear-caso.md` paso 6 con retry para evitar falsos negativos por race conditions de filesystem en Windows tras cerrar el grabador. Output: `AUTOFLOW_RECORDING: { ok, path, tamaño, listado, razon? }`. Si falla, devuelve también el listado de `.autoflow/recordings/` para que el agente pueda mostrarlo al QA y comparar contra lo que ve en su file explorer. |
| `validar-trazas.js [--solo-audit]` | Audita las trazas de todos los Tests con `session.activa === false`. Por cada uno: si `path.json` existe y tiene `path[]` no vacío → OK; si falta y hay inputs (`parsed.json` + `grupos.json`) → invoca `generar-traza.js` para regenerarla; si falla la regeneración → reporta razón; sin inputs → marca como irrecuperable. Output: `AUTOFLOW_VALIDAR_TRAZAS: { ok, regenerado, fallido, irrecuperable }`. Idempotente. `--solo-audit` reporta sin intentar regenerar. |
| `record-auth.js <canal-slug> <userKey> <urlInicial>` | Lanza codegen con `--save-storage` para grabar un login reusable. Output en `auth/{canal-slug}-{userKey}.json`. |
| `parse-codegen-output.js <numero>` | Parsea el `.spec.ts` crudo y emite nodos crudos con selector normalizado y confiabilidad 1-5. **Acciones soportadas**: `goto`, `click`, `fill`, `press`, `check`, `uncheck`, `selectOption`, `hover`, `setInputFiles` (uploads), `assert` con matchers comunes + `toHaveAttribute` (con valor esperado del atributo) + `toHaveClass` (regex literal o string). **Descarta** los `press` de Ctrl+C / Ctrl+V / Cmd+C / Cmd+V (shortcuts de portapapeles que el QA suele meter sin querer durante la grabación). |
| `parse-alm-export.js <archivo>` | Lee un xlsx exportado de ALM (A2 = testId, C2 = nombre, G2 = enfoque). Resuelve la ruta tal cual o dentro de `alm-exports/`. Emite JSON por stdout. |
| `exportar-alm.js <slug> --test=<testId> [--format=xlsx\|csv\|json]` | Inversa del anterior — exporta un Test a un archivo importable por ALM. **La fuente de verdad es la traza del Test** (`.autoflow/recordings/{testId}-path.json`) cruzada con `.autoflow/nodos.json`. Cada Nodo de la traza = un row con Test ID, Test Name, Step Number, Step (label corto: `Click`, `Llenar campo`, `Validar visibilidad`, `Capturar valor`, etc.), Description en **imperativo** (*"Hacer click en el botón 'Aceptar'"*, *"Validar que el título 'Inicio' sea visible en pantalla"*) y Expected Result **observable**, una sola línea sin paréntesis genéricos (*"El botón 'Aceptar' se acciona correctamente."*, *"El título 'Inicio' se muestra correctamente."*). Pensado para que un QA lea el archivo en ALM y pueda recrear el caso a mano. Si falta el `path.json`, frena con instrucciones para regenerarlo. Output en `.autoflow/alm-exports/{slug}-testId-{N}-{ts}.{ext}`. Imprime `AUTOFLOW_EXPORT: { ok, path, rows, format }`. |
| `generar-traza.js <numero>` | Reconstruye `path.json` desde `parsed.json` + `grupos.json` + `nodos.json`. Aborta si algún nodo queda sin asignar. **Sigue `reemplazadoPor`** cuando el parsed apunta a un nodo deprecated: la traza queda con el id del nodo live, coherente con el selectorRaw que el código del PO ejecuta. |
| `validar-coherencia.js [<slug>] [--fix]` | Valida coherencia: specs referenciados que no existen, sidecars con ids inexistentes en `nodos.json`, POs sin sidecar, deprecated sin reemplazo. Sin slug valida todo; con slug solo ese test set. Salida `AUTOFLOW_VALIDACION:` con `{ ok, errores, warnings }`. Lo corre `correr-test-set.md` antes de ejecutar. **Resolución de `specPath`**: 3 niveles de fallback (raíz del JSON → primer caso → canónico `tests/{slug}-{id}.spec.ts`). Si el JSON quedó mal armado (specPath dentro de `casos[]`), avisa por warning y, con `--fix`, lo escribe a la raíz y limpia los duplicados internos. |
| `cobertura.js` | Agrega todas las trazas (`*-path.json`) y emite `grafos/cobertura.md` + `grafos/cobertura.html` con qué nodos están cubiertos, por qué tests, % por page, y nodos sin cobertura. |
| `grafo.js` | Regenera `grafos/grafo.md` y `grafos/grafo.html` (pages y `conecta`). |
| `grafo-nodos.js` | Regenera `grafos/grafo-nodos.md` y `grafos/grafo-nodos.html` (nodos coloreados por confiabilidad y tipo). |
| `lib/render-html.js` | Helper compartido: envuelve un diagrama Mermaid en un HTML autocontenido con pan/zoom (mermaid + svg-pan-zoom desde CDN). |
| `dashboard.js` | Genera `.autoflow/dashboard.html` — vista única navegable del proyecto. **Auto-reparación de trazas faltantes**: antes de leer el estado, detecta sesiones cerradas (`activa: false`) cuyo `path.json` falta pero tienen inputs (`parsed.json` + `grupos.json`) y dispara `validar-trazas.js` para regenerarlas. Cubre el caso del agente que escribió el spec pero salteó `generar-traza.js` — sin esto el dashboard mostraba el Test sin pasos ni grafo. **Sidebar**: sección Usuario (perfil del QA, editable vía prompt al agente o descarga de `user.json`) + sección **Manual de uso** (lee `dashboard-manual.md` y lo renderiza con marked.js + TOC con anchors a las secciones h2) + Test Sets expandibles a Tests. **Cada Page** tiene un color determinístico (hash del nombre) que se aplica consistentemente en pasos, page-bar de cada Test y bordes de cards. **Page-bar**: barra horizontal fina debajo del nombre de cada Test que muestra las pages tocadas como segmentos coloreados conectados (en orden de visita). **Tab Detalles del Test Set**: Page Objects en grid de 7 cards por fila con métricas (locators, métodos, nodos, confiabilidad promedio, # de Tests que lo usan); cards no clickeables por ahora. **Expansión por cadena**: el spec típicamente importa solo el PO de entrada (LoginPage), pero los métodos van retornando otros POs en cadena (`login.ingresar() → OverviewPage → ...`). El dashboard recorre los `retornaPage` para descubrir la lista completa de POs usados — los descubiertos por cadena se marcan con 🔗. **Lectura de `specPath`**: 3 niveles de fallback — raíz del Test Set JSON (correcto), primer caso (formato viejo), o canónico `tests/{slug}-{id}.spec.ts` derivado de slug+id (último recurso si el agente armó mal el JSON). **Tab Pasos**: filas coloreadas por Page Object con click-to-modal del Nodo (cableado vía `data-paso-idx` + addEventListener para evitar el bug de doble escape). **Tab Grafo**: pasos del Test agrupados en `subgraph` por Page (LR adentro, TD entre subgraphs); cada subgraph coloreado con el hue de su Page; aristas inter-page resaltadas. **Empty state diagnóstico** del Test Set: distingue "spec no existe", "spec sin Tests", "spec con Tests pero sin imports detectados" y muestra los patrones que el parser busca. **Parser de imports** acepta default + named, con/sin extensión `.ts`, paths con `-`/`_`, ignora `import type`. **Modal de Nodo**: abrir en VSCode + copiar prompt actualización + bifurcar Test desde el nodo + Auto-Health Node (capturar DOM). Acepta `--open` para abrir en el browser. |
| `dashboard-manual.md` | Contenido del **Manual de uso** que el dashboard embebe en su sidebar. 10 secciones organizadas como **guía práctica por flujo del menú**: 🚀 Primeros pasos · 🧭 El menú · 🧪 Crear un Test · ▶️ Correr un Test · ✏️ Editar un Test (con sub-secciones por cada sub-opción: regrabar, editar código, añadir pasos, insertar nodo capturar/verificar, acción filtrada en lista, elegir fecha, bifurcar) · 📦 Test Sets (crear/editar/correr) · 📄 ALM (importar/exportar) · 🛠️ Mantenimiento (Auto-Health Node / Validar trazas / Cobertura / Login reusable / Utilidades) · 🖥️ Dashboard · ❓ Troubleshooting. Cada flujo tiene "cuándo usarlo", paso a paso, y tips. Editalo libremente — el dashboard lo lee al regenerarse. |
| `run-test.js <path>` | Corre un spec puntual. Default `--reporter=line` (rápido, sin trace). Acepta `--headed`, `--grep <texto>`, `--debug` (suma reporter html + trace=on para investigar fallos). Persiste el run en `runs/`. |
| `run-testset.js <slug>` | Corre todos los casos de un test set. Default headless paralelo + `--reporter=line`. Acepta `--headed` (fuerza `--workers=1`), `--debug` (reporter html + trace=on). Persiste el run en `runs/`. Resuelve `specPath` con el mismo fallback de 3 niveles que el dashboard (raíz → primer caso → canónico `tests/{slug}-{id}.spec.ts`). |
