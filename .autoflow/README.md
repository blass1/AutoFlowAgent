# `.autoflow/` — Estado y configuración del agente

Este directorio contiene los **prompts del agente AutoFlow**, sus **convenciones de código**, y el **estado runtime** de las grabaciones, fingerprints, nodos, trazas y test sets.

## Estructura

```
.autoflow/
├── prompts/                # sub-prompts que el agente carga según la acción del QA
├── conventions/
│   └── pom-rules.md        # reglas que el agente sigue al generar POMs y tests
├── scripts/                # parser, generador de traza, scripts de grafo, runners
├── urls/
│   └── urls.json           # catálogo de canales (nombre + URL inicial)
├── recordings/             # archivos generados durante una sesión de grabación
├── fingerprints/           # un sidecar JSON por page con nodos[], asserts[], conecta[]
├── testsets/               # un JSON por test set
├── grafos/                 # diagramas Mermaid generados por script
├── nodos.json              # diccionario global de nodos (fuente de verdad)
├── user.json               # datos del QA (creado en el onboarding, no se commitea)
└── user.json.example       # ejemplo del shape de user.json
```

## Qué se commitea y qué no

**Sí** se commitean:
- `prompts/`, `conventions/`, `scripts/`, `urls/`, este README, `user.json.example`, los `.gitkeep` de las carpetas runtime.
- `fingerprints/`, `testsets/`, `nodos.json` y `grafos/` — son los assets del proyecto que el equipo va construyendo.

**No** se commitea (ya está en `.gitignore`):
- `user.json` — identidad personal del QA.
- `recordings/*` — estado efímero de grabaciones (excepto el `.gitkeep`).

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
| `urls/urls.json` | Canales reusables al crear un caso: `{ canales: [{ nombre, url }, ...] }`. |
| `grafos/grafo.md` | Mermaid del grafo de pages (alto nivel). |
| `grafos/grafo-nodos.md` | Mermaid del grafo de nodos coloreado por confiabilidad del locator (1-5). |

## Prompts disponibles

| Prompt | Para qué |
| --- | --- |
| `setup-entorno.md` | Se carga al activar el modo. Verifica `node_modules` y los browsers de Playwright; si falta algo, guía al QA para instalarlo. |
| `onboarding.md` | Primer uso — pide nombre, legajo, equipo, tribu. |
| `menu-principal.md` | Menú con las 6 acciones. |
| `crear-caso.md` | Lanza grabación con codegen, pidiendo nombre/TC/canal (de `urls/urls.json`). |
| `editar-caso.md` | Regrabar / editar código / append. |
| `correr-caso.md` | Corre un caso puntual. |
| `crear-test-set.md` | Agrupa casos en un test set. |
| `editar-test-set.md` | Modifica un test set existente. |
| `correr-test-set.md` | Corre todos los casos de un set. |
| `generar-pom.md` | Post-grabación — matchea pages existentes, agrupa pasos, genera POMs, sidecars, nodos, traza y spec. |

## Scripts disponibles

| Script | Para qué |
| --- | --- |
| `start-recording.js` | Lanza `playwright codegen` con la URL de la sesión activa. |
| `parse-codegen-output.js <numero>` | Parsea el `.spec.ts` crudo y emite nodos crudos con selector normalizado y confiabilidad 1-5. |
| `generar-traza.js <numero>` | Reconstruye `path.json` desde `parsed.json` + `grupos.json` + `nodos.json`. Aborta si algún nodo queda sin asignar. |
| `grafo.js` | Regenera `grafos/grafo.md` (pages y `conecta`). |
| `grafo-nodos.js` | Regenera `grafos/grafo-nodos.md` (nodos coloreados por confiabilidad). |
| `run-test.js <path>` | Corre un spec puntual. Acepta `--headed`. |
| `run-testset.js <slug>` | Corre todos los casos de un test set. Acepta `--headed`. |
