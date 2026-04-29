---
mode: agent
description: Menú principal con las 6 acciones disponibles para el QA.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Menú principal

Usá `#tool:vscode/askQuestions` con una pregunta single-select: `"¿Qué querés hacer?"` con estas opciones:

- `✨ Crear un nuevo caso de prueba automatizado`
- `✏️ Editar un caso de prueba existente`
- `▶️ Correr un caso de prueba`
- `📦 Crear un Test set`
- `🔧 Editar un Test set`
- `🚀 Correr un Test set`

## Routing

Según la opción que elija el QA, cargá el sub-prompt correspondiente:

| Opción | Prompt a cargar |
| --- | --- |
| `✨ Crear un nuevo caso...` | `.autoflow/prompts/crear-caso.md` |
| `✏️ Editar un caso...` | `.autoflow/prompts/editar-caso.md` |
| `▶️ Correr un caso...` | `.autoflow/prompts/correr-caso.md` |
| `📦 Crear un Test set` | `.autoflow/prompts/crear-test-set.md` |
| `🔧 Editar un Test set` | `.autoflow/prompts/editar-test-set.md` |
| `🚀 Correr un Test set` | `.autoflow/prompts/correr-test-set.md` |
