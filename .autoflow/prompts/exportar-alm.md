---
mode: agent
description: Humaniza un Test automatizado (POM + spec) aplicando las convenciones de ALM y emite un JSON listo para subir a ALM via la integración, más una copia en xlsx.
tools: ['vscode/askQuestions', 'edit', 'read', 'runCommands']
---

# Humanizar y Exportar Test Automatizado a ALM

**Opción 2 del sub-menú ALM-HP**. Toma un Test ya automatizado del repo (POM + spec), lo traduce a lenguaje de negocio siguiendo las buenas prácticas de ALM, y emite un **JSON + xlsx** con los steps humanizados.

> **Importante**: la lógica de humanización vive en [`.autoflow/conventions/alm-steps.md`](../conventions/alm-steps.md). Esa convención es la **fuente de verdad** — manda en cualquier conflicto con este prompt.

> **A futuro**: un `.exe` de la integración (en `.autoflow/alm/integrations/`) va a tomar el JSON y subir los steps a ALM directamente. Por ahora el flujo termina con el archivo local.

## 1. Cargar las convenciones

Antes de cualquier cosa, leé [`.autoflow/conventions/alm-steps.md`](../conventions/alm-steps.md) con `read`. Esa es la **fuente de verdad**: rol que asumís, vocabulario base, reglas de transformación técnico→negocio, granularidad, formato de salida y checklist de calidad.

**No improvises** — seguí literal lo que dice esa convención. Si algo del prompt acá entra en conflicto, gana la convención.

## 2. Elegir el Test a exportar

Listá todos los Test Sets en `.autoflow/testsets/*.json`. Por cada uno, listá los Tests internos (`casos[]`).

Si **no hay** ningún Test, mensaje corto al QA y volver al menú principal.

`vscode/askQuestions` single-select: `"¿Qué Test querés humanizar y exportar a ALM?"` con todos los Tests del repo en formato:
```
{slug} → {nombre} [testId:{N}]
```

## 3. Leer POM(s) + spec

Una vez elegido el Test:

1. **Spec**: usar `set.specPath` (con fallback de 3 niveles: raíz → `casos[0].specPath` → canónico `tests/{slug}-{id}.spec.ts`).
2. **POMs**: parsear los `import` del spec y leer cada archivo `pages/*.ts` referenciado.
3. **Cadenas de retorno**: si un método de POM retorna otro POM (cadena `retornaPage`), leé también ese POM destino — los métodos de ahí pueden ser pasos del flujo aunque el spec no los importe directamente.

Si falta el spec o algún POM → frená y avisale al QA qué está faltando.

## 4. Aplicar las convenciones

Seguí el proceso de [`alm-steps.md`](../conventions/alm-steps.md) **en orden**:

1. **Diccionario de acciones**: por cada método del POM deduzcí su acción de negocio.
2. **Estructura del test**: extraé título ALM, objetivo, precondiciones, datos de prueba, pasos.
3. **Transformación**: aplicá el mapeo técnico → negocio del punto 3 de la convención.
4. **Granularidad**: cada acción observable = 1 step, sin solapar.
5. **Checklist de calidad**: pasalo entero antes de continuar al paso 5.

## 5. Confirmación con el QA

Antes de escribir archivos, mostrá el **resumen completo del Test humanizado** con **todos los steps**, no una muestra. El QA tiene que poder revisarlo entero antes de aceptar — los archivos `.json` / `.xlsx` recién se generan después del `✅`.

```
📋 Test humanizado: "{título ALM}"
   • Test ID:        {testId}
   • Spec:           {specPath}
   • POMs leídos:    {Page1}, {Page2}, ...
   • Steps generados: {N}

Precondiciones detectadas:
  • {precond 1}
  • ...

Datos de prueba:
  • {dato 1}: {valor o "(parametrizado)"}
  • ...

Steps ({N}):
  1. {name}
     → {description}
     ✅ {expected}

  2. {name}
     → {description}
     ✅ {expected}

  ...

  {N}. {name}
     → {description}
     ✅ {expected}
```

> **No truncar** — emití los `N` steps completos en el chat aunque el mensaje quede largo. Es el único punto donde el QA revisa el contenido antes de que se materialice.

`vscode/askQuestions` single-select: `"¿Cómo está el caso humanizado?"`:
- `✅ Si está correcto, exportá` → seguí al paso 6.
- `🔄 Regenera los pasos nuevamente` → descartá la humanización actual y volvé al paso 4 desde cero (releé la convención, releé POM + spec, volvé a generar). Útil cuando el QA quiere otra pasada completa sin instrucciones específicas.
- `✏️ Ajustemos algunos pasos` → text input: `"¿Qué pasos ajustamos y cómo?"`. Tomá el feedback del QA y volvé al paso 4 **conservando los steps que el QA no mencionó** — solo regenerás los que pidió cambiar. Después volvé a mostrar el resumen completo (paso 5) para que el QA confirme el resultado.
- `❌ Cancelar` → volvé al menú principal sin escribir nada.

## 6. Emitir el JSON

Asegurate que `.autoflow/alm/exports/` exista (creala si no). Escribí:

```
.autoflow/alm/exports/{slug}-testId-{N}-{ts}.json
```

Donde `{ts}` es un timestamp compacto (`YYYY-MM-DD-HH-MM-SS`).

Forma **exacta** del JSON (dictada por `alm-steps.md`):
```json
{
  "test_id": "{testId}",
  "new_steps": [
    {
      "action": "create",
      "name": "...",
      "description": "...",
      "expected": "..."
    }
  ]
}
```

## 7. Emitir el xlsx hermano

Disparar con `runCommands`:

```
node .autoflow/scripts/alm-json-to-xlsx.js "<path del .json recién creado>"
```

El script lee el JSON y escribe un `.xlsx` con el mismo basename en la misma carpeta. Una sola hoja con columnas `Step Number · Action · Name · Description · Expected`.

Output del script: `AUTOFLOW_ALM_XLSX: { ok, path, rows }`. Si falla, mostrale el error al QA pero el JSON ya quedó persistido — el xlsx es secundario.

## 7.5. Comparación con el original de ALM (si hay cache)

Después de emitir los archivos, comparamos el caso humanizado **nuevo** con la versión **original que vive en ALM** (cacheada por la integración).

### Buscar el cache local

Chequeá si existe:
```
.autoflow/alm/originalTests/{testId}.json
```

- **No existe** → mostrá un aviso corto y salteá toda esta sección, andá al paso 8:
  ```
  ℹ️ No tengo cacheado el original de ALM para este testId.
     Para comparar contra el original, importalo primero con
     "🔍 Importar y Analizar un Test de ALM" desde el menú ALM-HP.
  ```
- **Existe** → leelo y seguí.

### Comparación cuantitativa

Tomá:
- `N_original = steps[].length` del JSON cacheado.
- `N_nuevo = new_steps[].length` del JSON que acabás de emitir.

Calculá:
- `delta = N_nuevo - N_original` (puede ser positivo, negativo o 0).
- `porcentaje = (delta / N_original) * 100`, redondeado a 1 decimal.

### Análisis cualitativo

Compará el contenido de `originalTests/{testId}.json` `steps[]` contra `new_steps[]` y reportá las **mejoras concretas** que detectes. Mirá específicamente:

- **Granularidad**: ¿el nuevo separa pasos que el original tenía solapados? Buscá conectores `" y "`, `" luego "`, etc. en `description`/`expected` del original que el nuevo haya partido.
- **Cobertura de `expected`**: ¿cuántos steps del original tienen `expected` vacío o genérico? ¿el nuevo los completa todos con verificaciones observables?
- **Vocabulario consistente**: ¿el original mezcla nombres en inglés/español o usa selectores técnicos? El nuevo usa el vocabulario del `alm-steps.md`.
- **Verificaciones agregadas**: ¿el nuevo emite asserts de negocio (`toHaveText`, `toBeChecked`, etc.) que el original no documentaba?
- **Acciones técnicas filtradas**: ¿el original tenía pasos tipo "Esperar 3 segundos" o "Verificar URL" que el nuevo absorbió en expecteds?

### Reporte al QA

Mostrá un resumen estructurado:

```
📊 Comparación con la versión original de ALM:

   Test: {test_name}
   Test ID: {test_id}

   Cantidad de pasos:
     • Original (ALM):  {N_original}
     • Nuevo (auto):    {N_nuevo}
     • Diferencia:      {±delta} pasos ({±porcentaje}%)

   Mejoras del caso nuevo (vs original):
     • {mejora 1 — concreta, citando ejemplos cuando aplique}
     • {mejora 2}
     • {mejora 3}
     • ...

   ℹ️ El original se cacheó el {ISO timestamp del archivo}. Si el caso fue
      modificado en ALM después, refrescá el cache con "🔍 Importar y Analizar
      un Test de ALM" antes de comparar.
```

**Reglas para las mejoras**:
- Sé concreto, citá ejemplos del original ("el step 4 original *'Ingresar usuario y presionar Ingresar'* se separó en 2 pasos atómicos").
- Si **no detectás mejoras claras** (el original ya era bueno, o ambos coinciden), decilo honesto: *"El original ya estaba bien estructurado. El nuevo no agrega mejoras significativas más allá del formato canónico para la integración."*
- **No inflés**. Si el nuevo tiene menos pasos que el original (delta negativo), pueden ser pasos técnicos absorbidos en expecteds (mejora) o pasos faltantes en la automatización (problema) — distinguilo en el reporte.

### Persistir el análisis para el dashboard

Después de mostrarle el análisis al QA en el chat, **escribilo también a disco** como sidecar Markdown al lado del `.json`:

```
.autoflow/alm/exports/{basename}-analisis.md
```

(Donde `{basename}` es el mismo nombre del export sin la extensión `.json`. Ej: si el export es `compraSamsungGalaxyS6-testId-99001-2026-05-12-14-30-15.json`, el análisis va en `compraSamsungGalaxyS6-testId-99001-2026-05-12-14-30-15-analisis.md`.)

Contenido del `.md` (markdown crudo, sin code-fence):

```markdown
# Comparación con el original de ALM — Test {test_id}

**Test:** {test_name}
**Cache original:** {ISO timestamp del archivo originalTests/{testId}.json}
**Export generado:** {ISO timestamp del archivo nuevo}

## Cantidad de pasos

| Versión | Pasos |
|---|---|
| Original (ALM) | {N_original} |
| Nuevo (auto) | {N_nuevo} |
| Diferencia | {±delta} ({±porcentaje}%) |

## Mejoras del caso nuevo

- {mejora 1, en oración completa con ejemplo concreto}
- {mejora 2}
- {mejora 3}
- ...
```

> El dashboard (`dashboard.js`) lee este `.md` y lo renderiza en la tab **📄 ALM** junto al diff cuantitativo, para que el QA vea visualmente la comparación sin tener que recordar el output del chat.

## 8. Cierre

Mostrale al QA:

```
✅ Listo. Exporté:
   • {path}.json   ← formato canónico para la integración
   • {path}.xlsx   ← copia humana para revisar / editar

Cuando el .exe de la integración esté en .autoflow/alm/integrations/,
el JSON se sube a ALM solo. Por ahora queda local.
```

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `📤 Exportar otro Test` → volvé al paso 2.
- `↩️ Volver al menú principal`
