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
| `{numero}-grupos.json` | Rangos `{ page, desde, hasta }` que el agente persiste mientras agrupa | No (temporal) |
| `{numero}-path.json` | Traza del recording: secuencia de ids de nodo visitados | **Sí (histórico)** |

Los temporales se borran en el paso 10 de [prompts/generar-pom.md](prompts/generar-pom.md), pero solo después de verificar que `path.json` se generó correctamente.

## Estado del proyecto fuera de `recordings/`

| Archivo / carpeta | Qué tiene |
| --- | --- |
| `nodos.json` | Diccionario `{ id: nodo }` con todos los nodos conocidos. Cada id es `{page}::{accion}::{selector}`. Se enriquece con cada grabación; los nodos existentes no se sobreescriben. |
| `fingerprints/{Page}.json` | Sidecar de cada Page Object: `{ page, nodos: [id, ...], asserts: [id, ...], conecta: [destino, ...] }`. `nodos[]` participa del matcheo de prefijo; `asserts[]` no. |
| `testsets/{slug}.json` | Definición de cada test set (id, nombre, descripción, casos). |
| `alm-exports/` | xlsx exportados desde ALM. El QA suelta el archivo acá y `crear-caso.md` lo levanta vía `parse-alm-export.js` para prellenar nombre/TC/enfoque. |
| `auth/{canal-slug}-{userKey}.json` | StorageState (cookies + localStorage) post-login. Generado por `setup-auth.md`. Permite que los casos arranquen logueados sin re-grabar el login. **Sensible** — gitignored. |
| `captures/{numero}/{key}.json` | Por cada nodo `capturar`/`verificar` armado vía "HTML + intent": guarda el HTML pegado, el intent del QA, el locator propuesto, el final, y el razonamiento. Sirve para `actualizar-nodos.md` cuando el front cambia. |
| `grafos/grafo.md` · `grafo.html` | Grafo de pages (alto nivel). |
| `grafos/grafo-nodos.md` · `grafo-nodos.html` | Grafo de nodos coloreado por confiabilidad (1-5) y por tipo (capturar/verificar). |
| `grafos/cobertura.md` · `cobertura.html` | Cobertura de nodos: qué pisa cada test, qué nodos no pisa nadie, % por page. Generado por `cobertura.js`. |
| `runs/{timestamp}.json` | Historial de ejecuciones. Lo escriben `run-test.js` y `run-testset.js` en cada corrida. Lo lee el dashboard para mostrar la pestaña "Ejecuciones". **Gitignored** — es estado local del dev. |
| `dashboard.html` | Vista navegable del proyecto (Test Sets, Tests, pasos, ejecuciones, grafo). Generado por `dashboard.js`. **Gitignored** — se regenera bajo demanda. |

## Prompts disponibles

| Prompt | Para qué |
| --- | --- |
| `setup-entorno.md` | Se carga al activar el modo. Verifica `node_modules` y los browsers de Playwright; además detecta sesiones zombi (grabaciones con `activa: true` de hace > 30 min) y le pregunta al QA qué hacer con ellas. |
| `setup-auth.md` | Graba un `storageState` por (canal, usuario) en `.autoflow/auth/`. Sirve para que los casos arranquen logueados sin volver a grabar el login. |
| `onboarding.md` | Primer uso — pide nombre, legajo, equipo, tribu. |
| `menu-principal.md` | Menú con todas las acciones disponibles. |
| `crear-caso.md` | Lanza grabación con codegen. Pregunta primero si los datos del caso vienen de un Export ALM (xlsx) o se cargan a mano. Después pregunta si arranca logueado (lista los `auth/*.json` del canal). |
| `editar-caso.md` | Regrabar / editar código / **añadir pasos al final del Test** (mergea pasos al final del `test()` existente reusando POMs) / insertar nodo de captura/verificación. |
| `insertar-nodo-especial.md` | Sub-flow invocado desde `editar-caso.md`. Inserta un nodo `capturar` o `verificar` en un caso existente. Para armar el locator ofrece 4 caminos: abrir Chrome hasta el paso N (`page.pause()`), pegar HTML + intent (el agente arma el locator), reusar un locator de un nodo existente, o pegar a mano. |
| `bifurcar-caso.md` | Sub-flow invocado desde `editar-caso.md` (o desde el botón "🍴 Bifurcar Test desde acá" del dashboard). Crea un **Test** nuevo a partir de un step de un **Test** existente: corre un warm-up que ejecuta el prefix y guarda `storageState`, después lanza codegen con `--load-storage` para grabar sólo la cola, y materializa el nuevo `test()` con prefix copiado + tail recién agrupado. |
| `correr-caso.md` | Corre un caso puntual. |
| `crear-test-set.md` | Agrupa casos en un test set. |
| `editar-test-set.md` | Modifica un test set existente. |
| `correr-test-set.md` | Corre todos los casos de un set. |
| `generar-pom.md` | Post-grabación — matchea pages existentes, agrupa pasos, genera POMs, sidecars, nodos, traza y spec. **Limpieza pre-agrupado** (paso 2.5): muestra todos los pasos parseados con multi-select para que el QA borre los no deseados (clicks accidentales, asserts ruidosos, navegación errónea); los nodos restantes se renumeran. **Listado colapsado**: las pages ya agrupadas se muestran en una línea (`✅ X (pasos N–M)`), solo el bloque "Nuevo" va completo. **Regrafos** una sola vez al final (paso 9.5), no per agrupación. **Colisión de nombres** (paso 5.5): si el QA elige un nombre de PO que ya existe, ofrece reusar un método existente, agregar un método nuevo a esa Page, o cambiar el nombre. |
| `actualizar-nodos.md` | Sub-flow invocado desde `correr-caso.md` / `correr-test-set.md` cuando un test falla. Repara locators que cambiaron en el front, marca el nodo viejo como `deprecated` y actualiza PO + sidecar + `nodos.json`. |

## Scripts disponibles

| Script | Para qué |
| --- | --- |
| `start-recording.js` | Lanza `playwright codegen` con la URL de la sesión activa. Si la sesión tiene `authState`, agrega `--load-storage` para arrancar logueado. |
| `record-auth.js <canal-slug> <userKey> <urlInicial>` | Lanza codegen con `--save-storage` para grabar un login reusable. Output en `auth/{canal-slug}-{userKey}.json`. |
| `parse-codegen-output.js <numero>` | Parsea el `.spec.ts` crudo y emite nodos crudos con selector normalizado y confiabilidad 1-5. **Descarta** los `press` de Ctrl+C / Ctrl+V / Cmd+C / Cmd+V (shortcuts de portapapeles que el QA suele meter sin querer durante la grabación). |
| `parse-alm-export.js <archivo>` | Lee un xlsx exportado de ALM (A2 = testId, C2 = nombre, G2 = enfoque). Resuelve la ruta tal cual o dentro de `alm-exports/`. Emite JSON por stdout. |
| `generar-traza.js <numero>` | Reconstruye `path.json` desde `parsed.json` + `grupos.json` + `nodos.json`. Aborta si algún nodo queda sin asignar. |
| `validar-coherencia.js [<slug>]` | Valida coherencia: specs referenciados que no existen, sidecars con ids inexistentes en `nodos.json`, POs sin sidecar, deprecated sin reemplazo. Sin slug valida todo; con slug solo ese test set. Salida `AUTOFLOW_VALIDACION:` con `{ ok, errores, warnings }`. Lo corre `correr-test-set.md` antes de ejecutar. |
| `cobertura.js` | Agrega todas las trazas (`*-path.json`) y emite `grafos/cobertura.md` + `grafos/cobertura.html` con qué nodos están cubiertos, por qué tests, % por page, y nodos sin cobertura. |
| `grafo.js` | Regenera `grafos/grafo.md` y `grafos/grafo.html` (pages y `conecta`). |
| `grafo-nodos.js` | Regenera `grafos/grafo-nodos.md` y `grafos/grafo-nodos.html` (nodos coloreados por confiabilidad y tipo). |
| `lib/render-html.js` | Helper compartido: envuelve un diagrama Mermaid en un HTML autocontenido con pan/zoom (mermaid + svg-pan-zoom desde CDN). |
| `dashboard.js` | Genera `.autoflow/dashboard.html` — vista única navegable del proyecto (Test Sets, Tests, pasos del flujo, historial de ejecuciones, grafo Mermaid del paso a paso del Test con click-to-edit). Acepta `--open` para abrir en el browser. |
| `run-test.js <path>` | Corre un spec puntual. Default `--reporter=line` (rápido, sin trace). Acepta `--headed`, `--grep <texto>`, `--debug` (suma reporter html + trace=on para investigar fallos). Persiste el run en `runs/`. |
| `run-testset.js <slug>` | Corre todos los casos de un test set. Default headless paralelo + `--reporter=line`. Acepta `--headed` (fuerza `--workers=1`), `--debug` (reporter html + trace=on). Persiste el run en `runs/`. |
