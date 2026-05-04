# AutoFlow

Compañero de automatización para QAs. Combina un **chat mode de GitHub Copilot Chat** con scripts de Node que orquestan `playwright codegen` para grabar sesiones manuales y generar **Page Objects + tests en TypeScript** sin que el QA escriba código.

> Solo homologación. No usar contra producción.

## El problema que resuelve

La automatización moderna tiene cuatro fricciones recurrentes:

1. **Barrera de código.** El QA que entiende el negocio rara vez escribe TypeScript. El que escribe el código rara vez entiende el flujo de negocio. Resultado: tests que cubren lo que el desarrollador cree, no lo que el QA ve.
2. **Page Objects duplicados.** Cada nueva grabación tiende a reinventar pantallas que ya existen. Sin matcheo automático, el repo termina con tres versiones de `LoginPage`.
3. **Locators frágiles sin señal temprana.** Un test que usa `nth-child(3)` pasa hoy y rompe en el próximo refactor del front, pero nada lo marca como deuda hasta que falla en CI.
4. **Sin trazabilidad real.** Los specs ejecutan, pero nadie puede responder "¿qué caminos del usuario están realmente cubiertos?" sin leer cada test a mano.

AutoFlow ataca las cuatro:

- El QA **navega** el flujo en el browser. La grabación se traduce a código siguiendo las convenciones del repo (`.autoflow/conventions/pom-rules.md`). El QA no tipea TypeScript — confirma con botones.
- Cada acción se materializa como un **Nodo** con id determinístico (`{page}::{accion}::{selector}`). Los nodos viven en `.autoflow/nodos.json` y son la base para que el agente **reconozca** flujos repetidos por matcheo de prefijo y **reuse** Page Objects existentes en lugar de duplicarlos.
- Cada nodo lleva una **confiabilidad de 1 a 5** según el tipo de locator (5 = `getByTestId`, 1 = CSS posicional). Visible en el listado al QA y en el grafo de nodos — la deuda de testabilidad se ve antes de que rompa.
- Cada grabación deja una **traza** (`{numero}-path.json`) con la secuencia de ids visitados, incluyendo asserts. Eso permite responder con un diff "qué nodos pasan por dónde" cross-recording, y construir un grafo dirigido del comportamiento real del usuario.

El resultado es un loop cerrado: el QA graba como usuario, el agente le devuelve código que cumple convenciones, y el repo va acumulando estructura analizable en lugar de tests sueltos.

## Qué hace

Es un agente conversacional que vive dentro de VS Code. El QA navega su flujo en el browser; AutoFlow captura la grabación, la parsea, propone un agrupamiento en pantallas reconociendo las que ya existen, y genera los Page Objects, el sidecar de fingerprint, los nodos, la traza y el spec de Playwright.

```mermaid
flowchart LR
    QA([QA])
    Chat[Copilot Chat<br/>chat mode AutoFlow]
    Prompts[(.autoflow/prompts<br/>sub-prompts)]
    Scripts[.autoflow/scripts<br/>Node]
    Codegen[playwright codegen<br/>Chromium]
    Pages[pages/<br/>tests/<br/>data/]
    Estado[(.autoflow/<br/>nodos · fingerprints · trazas)]

    QA -- conversa --> Chat
    Chat -- carga --> Prompts
    Chat -- dispara tasks --> Scripts
    Scripts -- lanza --> Codegen
    QA -- navega flujo --> Codegen
    Codegen -- spec crudo --> Scripts
    Scripts -- nodos parseados --> Chat
    Chat -- genera --> Pages
    Chat -- enriquece --> Estado
```

## Cómo funciona por dentro

El cerebro está en tres lugares:

| Pieza | Ubicación | Rol |
| --- | --- | --- |
| **Chat mode** | `.github/chatmodes/autoflow.chatmode.md` | Personalidad, reglas de arranque y routing entre sub-prompts. |
| **Sub-prompts** | `.autoflow/prompts/*.md` | Un archivo por acción. El agente los carga on-demand. |
| **Scripts Node** | `.autoflow/scripts/*.js` | Disparan codegen, parsean su output, generan trazas, regeneran grafos, corren tests. |

El agente solo **conversa, lee/escribe archivos y dispara VSCode tasks**. Toda la lógica imperativa (lanzar codegen, parsear el `.spec.ts` crudo, ejecutar Playwright, calcular trazas) vive en los scripts de Node.

```mermaid
flowchart TB
    subgraph VSCode
      ChatMode[autoflow.chatmode.md]
      SubPrompts[prompts/*.md]
      ChatMode --> SubPrompts
    end

    subgraph Estado[".autoflow/ — estado del proyecto"]
      User[user.json]
      Urls[urls/urls.json]
      Recordings[recordings/]
      Fingerprints[fingerprints/]
      Nodos[nodos.json]
      TestSets[testsets/]
      Grafos[grafos/]
    end

    Banner[consolegraph/<br/>banner ASCII] --> ChatMode

    subgraph Codigo[Código del proyecto]
      PagesDir[pages/]
      TestsDir[tests/]
      DataDir[data/]
      Fixtures[fixtures/]
    end

    SubPrompts -- lee/escribe --> Estado
    SubPrompts -- genera --> Codigo
    SubPrompts -- runTasks --> Tasks[.vscode/tasks.json]
    Tasks --> NodeScripts[.autoflow/scripts/]
    NodeScripts --> Recordings
    NodeScripts --> Nodos
    NodeScripts --> Grafos
    NodeScripts --> Codigo
```

## Flujo típico: crear un caso

```mermaid
sequenceDiagram
    participant QA
    participant Chat as AutoFlow (Copilot Chat)
    participant Script as scripts/*.js
    participant Codegen as playwright codegen
    participant FS as .autoflow/

    QA->>Chat: "Crear un caso"
    Chat->>QA: askQuestions (nombre, TC, canal/URL)
    QA-->>Chat: datos del caso
    Chat->>FS: crea {numero}-session.json (activa: true)
    Chat->>Script: runTasks → start-recording
    Script->>Codegen: spawn Chromium
    QA->>Codegen: navega el flujo
    QA->>Codegen: cierra browser
    Codegen-->>Script: spec.ts crudo
    Chat->>Script: parse-codegen-output → nodos crudos
    Chat->>Chat: matcheo de prefijo contra fingerprints
    Chat->>QA: listado con ✅ pages reusadas + "Nuevo" para agrupar
    QA-->>Chat: agrupa rangos en pages nuevas
    Chat->>FS: pages/*.ts + sidecars + nodos.json + grupos.json
    Chat->>FS: tests/*.spec.ts + data/*.ts (extraídos del recording)
    Chat->>Script: generar-traza → {numero}-path.json
    Chat->>FS: limpia temporales · marca sesión inactiva
    Chat->>QA: resumen + ofrecer correrlo headed
```

Durante la grabación el chat queda **bloqueado** esperando que el QA cierre Chromium. Cuando vuelve, el agente carga `generar-pom.md` y el ciclo continúa.

## Modelo de Nodos

Cada acción del recording (click, fill, goto, assert, hover, etc.) es un **Nodo** con esta forma:

```json
{
  "id": "LoginPage::click::getByRole:button:Ingresar",
  "page": "LoginPage",
  "accion": "click",
  "selector": "getByRole:button:Ingresar",
  "selectorRaw": "getByRole('button', { name: 'Ingresar' })",
  "valor": null,
  "matcher": null,
  "confiabilidad": 4
}
```

Tres usos del modelo:

1. **Reconocimiento de flujos repetidos.** Cuando una grabación nueva arranca con la misma secuencia de ids que un sidecar existente (`.autoflow/fingerprints/{Page}.json`), el agente la marca con ✅ y reusa el Page Object. Solo lo nuevo va a "Nuevo" para agrupar.
2. **Análisis de caminos.** Cada grabación deja una `{numero}-path.json` con la secuencia completa de ids visitados (acciones + asserts). Sirve para responder cross-recording "qué tests pasan por este nodo".
3. **Confiabilidad visible.** Escala 1-5 calculada del tipo de locator: 5 = `getByTestId`, 4 = `getByRole+name`, 3 = `getByLabel`, 2 = `getByPlaceholder`/`getByText`, 1 = CSS crudo. El agente la muestra al QA durante la agrupación y el grafo la pinta.

Dos grafos derivados se regeneran con scripts y viven en `.autoflow/grafos/`:
- [.autoflow/grafos/grafo.md](.autoflow/grafos/grafo.md) — pages y conexiones (`conecta`) entre ellas (alto nivel).
- [.autoflow/grafos/grafo-nodos.md](.autoflow/grafos/grafo-nodos.md) — nodos coloreados por confiabilidad, con aristas intra-page (`-->`), inter-page (`==>`) y de assert (`-.assert.->`).

Detalle completo del shape, escala de confiabilidad y reglas: [.autoflow/conventions/pom-rules.md](.autoflow/conventions/pom-rules.md).

## Datos de prueba

Dos capas, ambas en `data/`:

1. **`data/usuarios.ts`** — catálogo único de usuarios reusables. Cada entrada respeta la interface `User { canal, user, pass, dni? }`. Si una contraseña cambia en homologación, se cambia acá una sola vez y se propaga a todos los test sets que la usen.
2. **`data/data-{slug}.ts`** — un archivo por test set. Contiene los datos específicos (montos, búsquedas, productos) y **referencia a `usuarios`** para asociar el escenario con un usuario concreto.

El spec **solo importa `data{PascalSlug}` del archivo del test set**, nunca `usuarios` directo. La composición usuario+datos vive en el archivo del test set, en un solo lugar visible.

## Esperas y timeouts

El front del banco es lento, así que los defaults van más holgados que los de Playwright:
- `actionTimeout` y `navigationTimeout` arrancan en 60s ([playwright.config.ts](playwright.config.ts)).
- Los POMs usan `await this.page.waitForLoadState('networkidle')` después de navegar, no sleeps.
- `waitForTimeout` está **permitido como último recurso** pero **siempre con un comentario `// Wait: <razón concreta>`**. Sin esa justificación, no se acepta.
- Fixture opcional `humanize` con env var `AUTOFLOW_DELAY_MS` para correr "modo lento" cuando se debugea sin tocar código (ej: `AUTOFLOW_DELAY_MS=500 npm test`).

## Las 6 acciones del menú

| Acción | Sub-prompt | Qué hace |
| --- | --- | --- |
| ✨ Crear un caso | `crear-caso.md` | Pide nombre, TC, canal (de `urls/urls.json`), lanza codegen, captura el flujo, genera POMs y spec. |
| ✏️ Editar un caso | `editar-caso.md` | Regrabar, editar código a mano o appendear pasos. |
| ▶️ Correr un caso | `correr-caso.md` | Ejecuta un spec puntual con UI mode. |
| 📦 Crear test set | `crear-test-set.md` | Agrupa varios casos en un JSON dentro de `testsets/`. |
| 🔧 Editar test set | `editar-test-set.md` | Modifica un set existente. |
| 🚀 Correr test set | `correr-test-set.md` | Corre toda la regresión del set. |

Sub-prompts adicionales que el agente carga sin que el QA los pida:
- `setup-entorno.md` — al activar el modo, verifica `node_modules` y browsers de Playwright.
- `onboarding.md` — primer uso, pide identidad del QA y la guarda en `.autoflow/user.json`.
- `menu-principal.md` — menú de las 6 acciones.
- `generar-pom.md` — post-grabación, agrupa nodos en pages y genera código.

## Cómo conversa el agente

Apenas se activa el modo, lo primero que ve el QA es el banner ASCII de [consolegraph/autoFlowAgent-0.1.1.txt](consolegraph/autoFlowAgent-0.1.1.txt) seguido de un aviso corto de que se está chequeando el entorno (Playwright, browsers). Recién después viene el saludo o el onboarding. Para cambiar el banner basta con editar el `.txt` — no hace falta tocar código.

AutoFlow usa la herramienta nativa **`vscode/askQuestions`** de Copilot Chat. En vez de tipear, el QA recibe paneles interactivos:

- **Botones radio** — elegir una opción.
- **Checkboxes** — tildar varias.
- **Campos de texto** — datos libres.
- **Carrusel** — varias preguntas relacionadas en una sola llamada.

> Si el tool no está disponible (Copilot viejo o setting deshabilitado), el agente cae automáticamente a **modo texto** con opciones numeradas. La lógica de routing es idéntica.

## Requisitos

- **VS Code 1.109+** con la extensión **GitHub Copilot Chat** actualizada.
- Setting `chat.askQuestions.enabled` habilitado (suele venir por defecto).
- Plan **Copilot Business** o **Enterprise**.
- **Node 18+**.

## Arranque rápido

```bash
git clone <url-del-repo> autoflow
cd autoflow
code .
```

En VS Code:

1. Abrí Copilot Chat.
2. Elegí el chat mode **AutoFlow** (dropdown arriba del input).
3. Decile *"hola"*.

La **primera vez** detecta que faltan `node_modules` y los browsers de Playwright, y te guía para instalarlos (`npm install` + `npx playwright install chromium`). Después hace un onboarding corto (nombre, legajo, equipo, tribu) y guarda `.autoflow/user.json` (no se commitea). A partir de ahí cada sesión arranca directo en el menú.

> Si preferís instalar a mano: `npm install && npx playwright install chromium` antes de abrir el chat.

## Estructura del repo

| Carpeta / archivo | Para qué |
| --- | --- |
| `.github/chatmodes/autoflow.chatmode.md` | Definición del chat mode (personalidad, routing, reglas de arranque). |
| `.github/copilot-instructions.md` | Convenciones globales del repo. |
| `.autoflow/prompts/` | Sub-prompts que el agente carga según la acción. |
| `.autoflow/conventions/pom-rules.md` | Reglas que el agente sigue al generar POMs y tests. |
| `.autoflow/recordings/` | Estado runtime por grabación (`session`, `parsed`, `grupos`, `path`, `spec`). |
| `.autoflow/fingerprints/` | Sidecar por page con `nodos[]`, `asserts[]` y `conecta[]`. |
| `.autoflow/testsets/` | Definición de cada test set como JSON. |
| `.autoflow/urls/urls.json` | Catálogo de canales (nombre + URL inicial) reusables al crear casos. |
| `.autoflow/scripts/` | Scripts Node: parser de codegen, generador de traza, grafos, runners. |
| `.autoflow/nodos.json` | Diccionario global de nodos — fuente de verdad de cada acción. |
| `.autoflow/grafos/` | Diagramas Mermaid generados por script (`grafo.md`, `grafo-nodos.md`). |
| `.autoflow/user.json` | Identidad del QA (no se commitea). |
| `.vscode/tasks.json` | Tasks que dispara el agente (`autoflow:start-recording`, `autoflow:run-test*`, `autoflow:run-testset*`). |
| `consolegraph/` | Banner ASCII de arranque que el agente muestra como primer mensaje. |
| `pages/` | Page Objects (los puebla el agente). |
| `tests/` | Specs Playwright (los puebla el agente). |
| `fixtures/index.ts` | Fixtures tipadas (`test.extend`). Sin clase base. Incluye fixture `humanize`. |
| `data/types.ts` · `data/usuarios.ts` | Seeds: interface `User` y catálogo de usuarios reusables. |
| `data/data-{slug}.ts` | Datos por test set, referencian a `usuarios`. Los crea el agente. |
| `playwright.config.ts` | Timeouts amplios (`actionTimeout`/`navigationTimeout` = 60s) para fronts lentos. |
| `clearSession.js` | Resetea el proyecto borrando todo lo generado por el agente. |

Más detalle del estado runtime y los archivos de cada grabación: [.autoflow/README.md](.autoflow/README.md).

## Comandos manuales

Por si querés correr cosas sin pasar por el agente:

```bash
# Grabar (requiere una sesión activa creada por el agente)
node .autoflow/scripts/start-recording.js
# o:                                npm run record

# Parsear el output de codegen (genera nodos crudos)
node .autoflow/scripts/parse-codegen-output.js <numero>

# Generar la traza de un recording (path.json)
node .autoflow/scripts/generar-traza.js <numero>

# Regenerar los grafos (escriben en .autoflow/grafos/)
node .autoflow/scripts/grafo.js
node .autoflow/scripts/grafo-nodos.js

# Correr todos los tests
npx playwright test                          # o: npm test
npx playwright test --headed                 # o: npm run test:headed

# Correr un test puntual
node .autoflow/scripts/run-test.js tests/regresionDeCompras-44534.spec.ts

# Correr un test set
node .autoflow/scripts/run-testset.js regresionDeCompras
```

## Resetear el proyecto

Para volver el repo al estado anterior a cualquier sesión (útil para probar el agente desde cero o para limpiar antes de un demo):

```bash
node clearSession.js          # pide confirmación (escribir SI)
node clearSession.js --yes    # sin prompt, para CI o scripts
```

Borra: `user.json`, todas las grabaciones, fingerprints, testsets, `nodos.json`, los dos grafos, `pages/*`, `tests/*`, `data/*` (deja `data/index.ts` reseteado a `export {};`). **No toca** scripts, prompts, conventions, fixtures, configs ni `.gitkeep`.

## Stack

- `@playwright/test` con fixtures vía `test.extend` — **sin clase base**.
- `typescript` estricto.
- Nada más. Sin frameworks, sin servidores, sin webapps.

Convenciones de código completas: [.autoflow/conventions/pom-rules.md](.autoflow/conventions/pom-rules.md).
