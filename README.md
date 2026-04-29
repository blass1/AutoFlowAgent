# AutoFlow

Compañero de automatización para QAs del banco. Combina un agente conversacional dentro de **GitHub Copilot Chat** con scripts de Node que orquestan `playwright codegen` para grabar sesiones manuales y generar Page Objects en TypeScript.

> Solo homologación. No usar contra producción.

## Requisitos

- **VS Code 1.109+** con la extensión **GitHub Copilot Chat** actualizada.
- Setting `chat.askQuestions.enabled` habilitado (suele venir por defecto). Si las preguntas del agente aparecen como texto en lugar de botones, revisalo en `Ctrl+,` → buscá `askQuestions`.
- Plan **Copilot Business** o **Enterprise** (la licencia del banco sirve).
- **Node 18+** instalado.

## Cómo arranca un QA por primera vez

1. **Cloná el repo**:
   ```bash
   git clone <url-del-repo> autoflow
   cd autoflow
   ```

2. **Abrí el repo en VSCode**:
   ```bash
   code .
   ```

3. **Activá Copilot Chat** y elegí el chat mode **AutoFlow** (dropdown arriba del input del chat).

4. **Decile "hola"**.
   - La **primera vez** detecta que falta `node_modules` y los browsers de Playwright, y te guía para instalarlos (`npm install` + `npx playwright install chromium`). Confirmás y él los corre.
   - Después hace un onboarding corto (nombre, legajo, equipo, tribu).
   - A partir de ahí, cada vez que entres ya te reconoce y te muestra el menú principal.

> **Si preferís instalar a mano**, podés correr `npm install && npx playwright install chromium` antes de abrir Copilot. El agente detecta que ya está y arranca directo.

## Cómo conversa el agente

AutoFlow usa la herramienta nativa **`vscode/askQuestions`** de Copilot Chat. Cuando te tiene que pedir algo, te aparece un panel interactivo en el chat con:

- **Botones radio** cuando hay que elegir una sola opción (canal del caso, qué test correr, confirmar acción).
- **Checkboxes** cuando podés tildar varias (qué casos incluir en un test set, qué cortes de pantalla confirmar).
- **Campos de texto** para datos libres (nombre, número de TC, URL).
- **Carrusel** cuando son varias preguntas relacionadas — se navegan con flechas y respondés todo de una.

No tenés que tipear números ni copiar nombres: cliqueás y listo.

> **Si por alguna razón el tool no está disponible** (Copilot viejo, setting deshabilitado, error puntual), el agente cae automáticamente a modo texto y te pide respuestas tipeadas. La lógica es la misma.

**Excepción**: durante una grabación con `playwright codegen`, los comandos siguen siendo texto libre — `marcar: <pantalla>`, `nota: <texto>`, `terminé`, `cancelar`. Es a propósito: estás concentrado grabando y abrir un panel te distrae.

## Qué hace cada cosa

| Carpeta | Para qué |
| --- | --- |
| `.github/chatmodes/` | Definición del chat mode AutoFlow. |
| `.github/copilot-instructions.md` | Convenciones globales del repo. |
| `.autoflow/prompts/` | Sub-prompts que el agente carga según la acción. |
| `.autoflow/conventions/` | Reglas que el agente usa al generar POMs y tests. |
| `.autoflow/recordings/` | Estado runtime de las grabaciones (codegen + marcadores). |
| `.autoflow/testsets/` | Definición de cada test set como JSON. |
| `.vscode/tasks.json` | Tasks que dispara el agente (recorder, run test, run set). |
| `.autoflow/scripts/` | Scripts Node que orquestan codegen y corren tests. |
| `pages/` | Page Objects (los puebla el agente). |
| `tests/` | Specs Playwright (los puebla el agente). |
| `fixtures/` | Fixtures tipadas (`test.extend`). |

## Comandos manuales

Por si querés correr cosas sin pasar por el agente:

```bash
# Lanzar codegen (requiere una sesión activa creada por el agente)
node .autoflow/scripts/start-recording.js

# Correr todos los tests
npx playwright test

# Correr un test puntual
node .autoflow/scripts/run-test.js tests/regresionDeCompras-44534.spec.ts

# Correr un test set
node .autoflow/scripts/run-testset.js regresionDeCompras
```

## Stack

- `@playwright/test` (con fixtures, **sin clase base**)
- `typescript` (estricto)
- Nada más. Sin frameworks, sin servidores, sin webapps.
