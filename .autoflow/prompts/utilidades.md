---
mode: agent
description: Aplica/desaplica utilidades complementarias del QA leídas de utils/. Cada utilidad declara cómo aplicarla en su header. El agente parsea el header, muestra preview de los cambios y aplica con confirmación.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Utilidades

Sub-flow para aplicar librerías complementarias que el QA dejó en `utils/` (ej: reporting custom, hooks de notificación, helpers extra). Cada archivo declara en su header con qué tags integrarlo. Convención completa en [utils/README.md](../../utils/README.md).

## 1. Listar utilidades disponibles

1. Listá `utils/*.ts` y `utils/*.js` (excluí `README.md` y `.gitkeep`).
2. Si no hay archivos, mostrá: `📭 No encontré utilidades en utils/. Mirá utils/README.md para la convención del header.` y volvé al menú.
3. Por cada archivo, leé las primeras ~80 líneas y parseá los tags:
   - `@autoflow-util <nombre>` → nombre canónico (obligatorio).
   - `@descripcion` → texto hasta el siguiente `@` (obligatorio).
   - `@aplicarEn <target>` → archivo destino: `fixtures` | `playwright-config` | `page-base` | `spec-helper` | lista separada por coma (obligatorio).
   - `@como-aplicar` → bloque de instrucciones hasta el siguiente `@` (obligatorio).
   - `@verificar` → opcional.
   - `@desinstalar` → opcional.
4. Cargá `.autoflow/utils-applied.json` (si no existe, asumí `{}`).
5. Para cada utilidad, calcular **estado**:
   - `✅ aplicada` — está en `utils-applied.json`.
   - `⏭ no aplicada` — no está.
   - `⚠️ sin instrucciones` — falta `@autoflow-util`, `@descripcion`, `@aplicarEn` o `@como-aplicar`.

## 2. Mostrar al QA

`#tool:vscode/askQuestions` **multi-select**: `"¿Qué utilidades querés aplicar/desaplicar?"`. Cada opción con la forma:

```
✅ pdfReporter — Genera PDF de cada Test (aplicada el 07/05)
⏭ slackNotifier — Notifica al canal #qa cuando un set falla (no aplicada)
⚠️ algoMalo — sin instrucciones — completá el header (no se puede aplicar)
```

- Las utilidades con `⚠️ sin instrucciones` aparecen en la lista pero **no son seleccionables** (o si las marca, las salteás con un mensaje).
- Si no se tilda nada, salí silencioso al cierre.

## 3. Procesar cada utilidad seleccionada (en orden)

### 3.a. Si está `⏭ no aplicada` → APLICAR

1. **Leer el archivo completo** del util.
2. Mostrarle al QA el bloque `@como-aplicar` **literal** (lo que escribió el creador del util):
   ```
   📋 Instrucciones de pdfReporter:

   {pegar el contenido de @como-aplicar tal cual}
   ```
3. **Razonar** sobre las instrucciones y armar un plan de cambios concreto:
   - Identificá los **archivos destino** combinando `@aplicarEn` con las pistas de `@como-aplicar`. Mapeo: `fixtures` → `fixtures/index.ts`, `playwright-config` → `playwright.config.ts`, `page-base` → `pages/_base.ts` (no existe por convención del repo — si pide eso, frená), `spec-helper` → preguntar al QA dónde lo querés.
   - Para cada archivo destino, listá los cambios línea por línea (qué agregás y dónde).
4. **Si las instrucciones son ambiguas** (no sabés qué archivo tocar, dónde insertar, qué reemplazar, o pide algo que no encaja con el repo) → **frená** y mostrale al QA:
   ```
   ⚠️ Las instrucciones de {nombre} no me alcanzan para aplicarla sin riesgo:
   {detalle concreto de lo que falta}

   Afiná el header siguiendo utils/README.md y volvé a correr Utilidades.
   ```
   No toques nada. Pasá al siguiente.
5. **Mostrar el preview** al QA:
   ```
   🪛 Voy a aplicar pdfReporter haciendo estos cambios:

   📄 fixtures/index.ts
      + (línea 3) import { generarPDF } from '../utils/pdfReporter';
      + (al final del archivo)
        test.afterEach(async ({ page }, testInfo) => {
          await generarPDF(testInfo, page);
        });

   📁 reportes/  (carpeta nueva)
   ```
6. `vscode/askQuestions` single-select: `"¿Aplico estos cambios?"`:
   - `✅ Aplicar`
   - `↩️ Saltar (no toco nada)`
7. **Si confirma**:
   - Para cada inserción, **chequear idempotencia**: si la línea exacta o un bloque equivalente ya está en el archivo, no la dupliques. Si está parcial, completá lo que falta.
   - Aplicá los cambios con `edit`.
   - Si la utilidad pide crear carpetas (`reportes/`, etc.), creá con `runCommands` (`mkdir -p`).
   - Sumá entrada en `.autoflow/utils-applied.json`:
     ```json
     {
       "pdfReporter": {
         "archivo": "utils/pdfReporter.ts",
         "aplicadoEn": "<iso-ahora>",
         "archivosTocados": ["fixtures/index.ts"],
         "carpetasCreadas": ["reportes"]
       }
     }
     ```
   - Confirmale al QA: `✓ Aplicada {nombre}.`

### 3.b. Si está `✅ aplicada` → DESAPLICAR

1. Leer `@desinstalar` del util.
2. **Si no tiene `@desinstalar`** → frená y avisá:
   ```
   ⚠️ {nombre} no tiene bloque @desinstalar.
   Desinstalala a mano revirtiendo lo de @como-aplicar, y borrá la entrada de
   .autoflow/utils-applied.json una vez que termines.
   ```
   Pasá al siguiente.
3. Si tiene → mismo flujo del 3.a (mostrar instrucciones literales → preview → confirmación → aplicar). En este caso los cambios suelen ser borrados de líneas/imports.
4. Tras confirmar y aplicar:
   - Eliminá la entrada de `utils-applied.json`.
   - **No** borres carpetas creadas (puede haber output del QA adentro). Avisale: `Si querés borrar la carpeta reportes/, hacelo a mano.`
   - Confirmale: `✓ Desaplicada {nombre}.`

## 4. Cierre

Mostrale un resumen corto:
```
🔧 Listo:
  • Aplicadas: {lista}
  • Desaplicadas: {lista}
  • Saltadas: {lista}
  • Sin instrucciones: {lista}
```

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `🔧 Aplicar/desaplicar otra` → volvé al paso 1 (recargá la lista).
- `🏠 Volver al menú`

## Reglas

- **Nunca tocar archivos sin confirmación**. Una confirmación por utilidad, una.
- **Idempotencia siempre**: chequear que la línea / bloque no esté antes de insertar. No duplicar imports ni hooks.
- **Frenar si está ambiguo**: peor que no aplicar, es aplicar mal y romper el código del QA. Si las instrucciones del header no son claras, frená y pediselo claro.
- **No leer/inventar más allá del header**: las instrucciones son lo que el creador del util escribió. No mezclar con conocimiento general del agente sobre la utilidad. Si dice "sumá un afterEach", el agente suma un afterEach, no inventa un beforeAll también.
