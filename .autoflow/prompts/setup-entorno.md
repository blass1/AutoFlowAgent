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

## 1.5. Limpieza de specs temporales colgados

Antes de chequear sesiones zombi, limpiá los specs temporales viejos de `tests/_temp/` que pueden haber quedado de corridas anteriores que crashearon a mitad de un flujo (warm-up de bifurcación, captura de DOM de Auto-Health Node, prueba de auth). El threshold de **>1 hora de antigüedad** evita borrar specs que estén siendo usados activamente en una corrida en paralelo.

Ejecutá con `runCommands` un comando determinístico que liste los archivos viejos y los borre. En Windows (PowerShell):

```powershell
Get-ChildItem tests/_temp/*.spec.ts -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddHours(-1) } | Remove-Item -Force
```

En bash/macOS/Linux:

```bash
find tests/_temp -name '*.spec.ts' -type f -mmin +60 -delete 2>/dev/null
```

**Hacelo callado**: no le anuncies al QA cada limpieza. Si por algún motivo el comando falla (carpeta no existe, permisos), seguí silencioso — no es bloqueante.

## 2. Sesiones zombi (grabaciones colgadas)

Antes de pasar al menú, chequeá si hay alguna grabación huérfana. Esto pasa cuando el QA cerró VSCode mientras la grabación corría: la sesión queda con `"activa": true` y el siguiente arranque la levanta y se confunde.

1. Listá `.autoflow/recordings/*-session.json` y filtrá las que tengan `activa === true`.
2. Para cada una, calculá la antigüedad: `ahora - fechaInicio`. Si la diferencia es **mayor a 30 minutos**, considerala zombi (las activas reales acaban de empezar).
3. Si no hay zombis, seguí silencioso al cierre.
4. Si hay una o más, abrí `vscode/askQuestions` single-select:

   ```
   Encontré {N} grabación(es) sin cerrar:
     • [testId:{numero}] "{nombre}" — arrancada hace {hh:mm}
     • ...

   ¿Qué hacemos?
   ```

   Opciones:
   - `🔧 Retomar la última (cargo generar-pom.md con el spec que quedó)` — solo si existe `{numero}.spec.ts` para esa sesión. Marcá `activa: false`, `fechaFin: <ahora>` y cargá `.autoflow/prompts/generar-pom.md`.
   - `🗑️ Cerrar y borrar todo lo temporal` — para cada zombi, marcá `activa: false`, `fechaFin: <ahora>` y borrá los temporales (`{numero}.spec.ts`, `{numero}-parsed.json`, `{numero}-grupos.json`). Mantené `session.json` y `path.json` si existieran.
   - `⏭️ Dejar como está y seguir` — solo marcá `activa: false` (sin borrar nada). Útil si el QA quiere inspeccionar a mano.

## 3. Cierre

- **Sin instalaciones ni zombis**: pasá silencioso al flujo siguiente.
- **Con instalaciones**: cerrá con `🚀 Todo listo. Ahora sí, vamos a lo nuestro.`
- **Con zombis resueltos**: si elegiste retomar, ya delegaste a `generar-pom.md`. Si elegiste borrar/dejar, una línea corta tipo `Limpié {N} sesiones colgadas.` y seguí.

## Reinstalación manual

Si en cualquier momento el QA pide "reinstalar dependencias" o "resetear el setup", volvé acá y ejecutá `npm install` (con `--force` si hace falta). Para reinstalar browsers de Playwright, corré `npx playwright install chromium --force`.
