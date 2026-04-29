---
mode: agent
description: Verifica que las dependencias del proyecto estén instaladas. Si falta algo, guía al QA para instalarlo.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands', 'runTasks']
---

# Setup de entorno

Esto se carga al activar el chat mode, antes de cualquier otra cosa. Si todo está instalado, este prompt pasa silencioso.

## 1. Verificar `node_modules`

Chequeá la existencia de `node_modules` con un comando **determinístico** vía `runCommands`. **No uses `read` sobre la carpeta** (falla porque es directorio, no archivo, y eso te puede llevar a concluir mal). **No te bases solo en `codebase`/`search`** — esos no listan `node_modules` por convención.

Comando a correr (Windows/PowerShell o bash, según el shell del workspace):

```bash
node -e "console.log(require('fs').existsSync('node_modules/@playwright/test/package.json') ? 'OK' : 'MISSING')"
```

Leé el output con `terminalLastCommand`. Solo seguí el branch de "falta instalar" si el output contiene literalmente `MISSING`. Cualquier otro output (incluyendo `OK`, errores raros, output vacío) tratalo como **instalado** y pasá al menú silencioso. Ante la duda, asumí instalado.

- **`OK`** → ejecutá `npx playwright --version` con `runCommands` (sanity check) y seguí al menú **sin imprimir nada**.
- **`MISSING`** → faltan dependencias. Decile al QA:
  > "👋 Faltan instalar las dependencias del proyecto. Lo hago yo, son 1-2 minutos."

  (No asumas que es la primera vez que abre el repo — quizás solo borró `node_modules`.)

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
