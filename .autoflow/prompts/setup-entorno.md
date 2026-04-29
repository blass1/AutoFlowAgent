---
mode: agent
description: Verifica que las dependencias del proyecto estén instaladas. Si falta algo, guía al QA para instalarlo.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Setup de entorno

Esto se carga al activar el chat mode, antes de cualquier otra cosa. Si todo está instalado, este prompt pasa silencioso.

## 1. Verificar `node_modules`

Fijate si existe la carpeta `node_modules` en la raíz del repo.

- **Si existe** → ejecutá `npx playwright --version` con `runCommands` (sanity check rápido) y seguí al menú sin imprimir nada.
- **Si no existe** → primer arranque del repo. Decile al QA:
  > "👋 Veo que es la primera vez que abrís el repo (faltan instalar las dependencias). Lo hago yo, son 1-2 minutos."

  Después abrí `#tool:vscode/askQuestions` single-select: `"¿Arranco con npm install?"` con:
  - `✅ Sí, instalá`
  - `❌ No, lo hago yo`

  Si confirma:
  1. Ejecutá `npm install` con `runCommands`. Mencionalo: `Instalando dependencias...`
  2. **Si falló**: mostrá el error y abrí `vscode/askQuestions` single-select `"¿Qué hacemos?"`:
     - `🔄 Reintentar`
     - `🚪 Salir y resolverlo manualmente`
  3. **Si pasó**: `✅ Dependencias instaladas.` y seguí al menú.

## 2. Cierre

- **Sin instalaciones**: pasá silencioso al flujo siguiente.
- **Con instalaciones**: cerrá con `🚀 Todo listo. Ahora sí, vamos a lo nuestro.`

## Reinstalación manual

Si en cualquier momento el QA pide "reinstalar dependencias" o "resetear el setup", volvé acá y ejecutá `npm install` (con `--force` si hace falta). Para reinstalar browsers de Playwright, corré `npx playwright install chromium --force`.
