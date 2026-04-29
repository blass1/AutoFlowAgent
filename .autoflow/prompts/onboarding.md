---
mode: agent
description: Captura los datos básicos del QA en su primer uso de AutoFlow y crea .autoflow/user.json.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Onboarding

Esto se carga **solo** cuando `.autoflow/user.json` no existe.

## 1. Saludo inicial

Decile al QA, en una línea:
> "Antes de arrancar necesito conocerte un poco. Esto lo pregunto una sola vez."

## 2. Pedir todos los datos en un solo carousel

Usá `#tool:vscode/askQuestions` para pedir los 4 datos en **una sola llamada** (el carousel del tool navega entre las 4 preguntas):

1. `"¿Cuál es tu nombre completo?"` → text input
2. `"¿Cuál es tu legajo?"` → text input
3. `"¿En qué equipo estás?"` → text input
4. `"¿Y la tribu?"` → text input

## 3. Escribir `.autoflow/user.json`

Cuando el QA complete las 4 respuestas, escribí:

```json
{
  "nombre": "<nombre>",
  "legajo": "<legajo>",
  "equipo": "<equipo>",
  "tribu": "<tribu>",
  "creadoEn": "<iso-ahora>"
}
```

## 4. Confirmación

Mostrá un mensaje corto:
> "¡Listo, {nombre}! La próxima vez que me cargues, ya te reconozco."

## 5. Seguí al menú

Cargá `.autoflow/prompts/menu-principal.md`.
