---
mode: agent
description: Inserta un nodo especial (capturar / verificar) en un caso ya grabado. Edita el spec y los Page Objects directamente.
tools: ['vscode/askQuestions', 'edit', 'read']
---

# Insertar nodo especial (capturar / verificar)

Este sub-prompt se invoca desde `editar-caso.md`. Cuando arranca, ya tenés:
- `numero` del caso elegido
- ruta del spec (`tests/{archivo}.spec.ts`)
- (opcional) sidecars de las pages involucradas en `.autoflow/fingerprints/`

Si llegaste sin esos datos, pediselos al QA antes de seguir (single-select con la lista de casos disponibles).

## 1. Cargar contexto del caso

Leé:
- `tests/{archivo}.spec.ts` — para tener los pasos en orden y saber dónde insertar.
- `.autoflow/recordings/{numero}-path.json` si existe — orden canónico de los nodos.
- `.autoflow/nodos.json` — para resolver cada id a su definición.
- Los sidecars de cada page que aparezca en el path.

Construí en memoria una lista ordenada `pasos[]`, donde cada entrada tiene:
```
{ indice, id, page, accion, label, nodoCompleto }
```

`label` es la `etiquetaCorta` que ya usa `grafo-nodos.js` (mantené criterio idéntico para que el QA vea lo mismo que en el grafo).

También recolectá las **variables capturadas** previamente en este test recorriendo el path: cada nodo `capturar` que aparezca antes de un punto dado define una variable disponible en ese punto.

## 2. Elegir punto de inserción

`#tool:vscode/askQuestions` single-select: `"¿Después de qué paso insertás el nodo?"` con la lista numerada:
- `0. (al inicio del test)`
- `1. [LoginPage] click → botonIngresar`
- `2. [LoginPage] fill → inputUsuario`
- ...

Guardá `indiceInsercion` (entero, 0 = antes del primer paso).

## 3. Tipo de nodo

`vscode/askQuestions` single-select: `"¿Qué tipo de nodo?"`:
- `🎯 Capturar valor`
- `🔍 Verificar contra captura previa o literal`

Si elige `🔍 Verificar` y **no hay variables capturadas** antes de `indiceInsercion` **y** preferís ofrecer solo modo literal (porque no podés referenciar nada todavía), avisale y forzá `modo = "literal"` en el paso 5.

## 4. Si eligió `🎯 Capturar`

Carrousel con estos campos:

1. `"Nombre de la variable"` → text input.
   Validá:
   - Regex `^[a-zA-Z][a-zA-Z0-9_]*$`. Si falla, decilo corto y volvé a pedir.
   - Que no choque con otra variable ya capturada **antes** de `indiceInsercion`. Si choca, decilo y volvé a pedir.
2. `"¿De dónde sale el selector?"` → single-select:
   - `Reusar locator de un nodo existente` → segunda llamada con la lista de nodos del recording que tienen `selectorRaw` (filtrá `goto`/`assert`/`capturar`/`verificar`).
   - `Pegar selector nuevo (Playwright)` → text input. Esperás algo como `getByTestId('saldo-disponible')` o `getByRole('text', { name: 'Saldo' })`. Validá mínima: que arranque con `getBy*` o `locator(`.
3. `"Regex opcional para limpiar el texto"` → text input (puede quedar vacío). Si el QA elige parser `currency-arg` y no pone regex, sugerile `\$\s*([\d.,]+)` como default y pediselo confirmar.
4. `"Parser"` → single-select:
   - `text` (string crudo)
   - `number` (genérico)
   - `currency-arg` ($ 1.234,56 → 1234.56)
   - `date`

Determiná la `page` destino: si el selector vino de un nodo existente, usá su `page`. Si lo pegó nuevo, mostralo en single-select con la lista de pages del recording (`"¿A qué Page Object pertenece este selector?"`).

Construí el nodo `capturar` (ver shape en [pom-rules.md](../conventions/pom-rules.md), sección "Nodos especiales").

## 5. Si eligió `🔍 Verificar`

`vscode/askQuestions` single-select: `"¿Comparar contra qué?"`:
- `📌 Variable capturada en este test`
- `🔢 Valor literal`

### 5.a. Modo `variable`

`vscode/askQuestions` single-select: `"¿Qué variable?"` con la lista de variables disponibles **antes** de `indiceInsercion`. Si la lista está vacía, avisá y volvé al paso 3.

### 5.b. Modo `literal`

Carrousel:
1. `"Valor literal a comparar (en string crudo, se va a parsear)"` → text input.
2. (los demás campos van en el carrousel del paso 5.c)

### 5.c. Carrousel común a ambos modos

1. `"¿De dónde sale el selector del nuevo valor?"` (igual al paso 4.2).
2. `"Regex opcional para limpiar el texto"` → text input.
3. `"Parser"` (igual al paso 4.4).
4. `"Condición"` → single-select:
   - `igual`
   - `distinto`
   - `aumentó`
   - `disminuyó`
   - `aumentó al menos N`
   - `aumentó al menos N%`
   - `disminuyó al menos N`
   - `disminuyó al menos N%`

   Si elige una de las 4 últimas, segunda llamada con un text input pidiendo `N`. Validá que sea numérico positivo. Guardá `condicion = { tipo, param, unidad }` con `unidad ∈ { "abs", "pct" }`.

5. `"Mensaje de error custom (opcional, queda como segundo argumento de expect)"` → text input. Si vacío, omitilo.

Determiná la `page` destino igual que en el paso 4.

## 6. Resumen y confirmar

Mostrale al QA un bloque tipo:

```
Voy a insertar después del paso {indiceInsercion}:

  🎯 capturar saldoInicial
     • page:    CuentasPage
     • locator: getByTestId('saldo-disponible')
     • regex:   \$\s*([\d.,]+)
     • parser:  currency-arg
```

o:

```
Voy a insertar después del paso {indiceInsercion}:

  🔍 verificar (disminuyó)
     • compara: vars.saldoInicial
     • page:    CuentasPage
     • locator: getByTestId('saldo-disponible')
     • parser:  currency-arg
     • mensaje: el saldo debió disminuir tras la transferencia
```

`vscode/askQuestions` single-select: `"¿Confirmás?"`:
- `✅ Sí, insertar`
- `✏️ Volver atrás`

## 7. Edición de archivos (sin regenerar nada)

### 7.a. Page Object de la `page` destino

Si el `selector` vino de un nodo existente y ya está en el constructor del PO, **no toques el PO**.

Si el selector es nuevo, abrí `pages/{Page}.ts` y:
1. Sumá un campo `private readonly {locName}: Locator;` siguiendo la nomenclatura del repo (locator privado en camelCase, prefijo descriptivo: `saldoDisponible`, `cardSaldo`, etc.). Pediselo al QA con un text input si no podés inferir uno bueno.
2. Inicializalo en el constructor con `selectorRaw` verbatim.
3. **No** agregues métodos públicos: el spec va a usar el locator a través de un getter o el agente expone el locator como `public readonly` (preferido para no escribir un método cada vez). Convertí el campo a `public readonly` cuando hace falta exponerlo al spec.

### 7.b. Spec

1. Asegurá los imports al inicio del archivo:
   - `import { test, expect } from '../fixtures';` (ya debería existir, no lo dupliques).
   - Si el parser elegido **no es** `text`, sumá el import específico desde `../data` (ej: `import { parseCurrencyAR } from '../data';`). Si ya está, no lo dupliques.
2. Asegurá que el callback del test recibe `vars` en la desestructuración: `async ({ page, vars }) => { ... }`. Si no estaba, agregalo.
3. Insertá las líneas correspondientes en el lugar exacto del paso `indiceInsercion`. Una línea en blanco antes y después del bloque para que se distinga visualmente.

**Snippet `capturar`:**
```typescript
const _raw_{varName} = await {pageVar}.{locName}.textContent();
{lineaParseo}
vars.set('{varName}', {valorParseado});
```

donde:
- `{lineaParseo}` aplica regex si corresponde:
  ```typescript
  const _clean_{varName} = (_raw_{varName} ?? '').match(/{regex}/)?.[1] ?? '';
  ```
  Si no hay regex, `_clean_{varName} = (_raw_{varName} ?? '').trim();`
- `{valorParseado}` = `_clean_{varName}` si parser `text`, sino `parseXxx(_clean_{varName})`.

**Snippet `verificar`:**
```typescript
const _raw_v_{key} = await {pageVar}.{locName}.textContent();
{lineaParseo}
expect({valorParseado}{coma+mensajeOpcional}).{matcher}({rhs});
```

Donde `{rhs}` se arma según `condicion`:
- `igual`/`distinto` → `vars.get<T>('{ref}')` o el literal parseado.
- `aumento` → `.toBeGreaterThan(...)`
- `disminuyo` → `.toBeLessThan(...)`
- `aumentoAlMenos abs` → `.toBeGreaterThanOrEqual(vars.get<number>('{ref}') + {param})`
- `aumentoAlMenos pct` → `.toBeGreaterThanOrEqual(vars.get<number>('{ref}') * (1 + {param}/100))`
- `disminuyoAlMenos abs` → `.toBeLessThanOrEqual(vars.get<number>('{ref}') - {param})`
- `disminuyoAlMenos pct` → `.toBeLessThanOrEqual(vars.get<number>('{ref}') * (1 - {param}/100))`

`{key}` para nombrar variables locales: si modo `variable`, `{key} = {ref}`; si modo `literal`, `{key} = "literal"` o un sufijo numérico si hay colisión.

### 7.c. `nodos.json` y sidecar

1. Agregá la entrada nueva a `.autoflow/nodos.json`. Si el id ya existe, validá que coincida y avisá al QA si no.
2. Abrí el sidecar `.autoflow/fingerprints/{Page}.json` y sumá el id en `nodos[]` en la posición que corresponde según `indiceInsercion`. Si la inserción cae fuera del rango de la page (porque el paso anterior pertenecía a otra page), agregalo al final del bloque de esa page o al inicio si `indiceInsercion = 0`.

### 7.d. Path histórico

Actualizá `.autoflow/recordings/{numero}-path.json` insertando el id en la posición `indiceInsercion`. **Sí**, este archivo se reescribe acá — la inserción manual es parte del flujo del caso, no una mutación silenciosa.

## 8. Cierre

Mostrale al QA un mensaje corto:

```
✅ Listo. Inserté {accion} en TC-{numero} (paso {indiceInsercion}).
   Te recomiendo correr el caso para verificar que el locator funciona:
   npm run run:test -- tests/{archivo}.spec.ts
```

`vscode/askQuestions` single-select: `"¿Algo más?"`:
- `➕ Insertar otro nodo en el mismo caso`
- `↩️ Volver a editar-caso`
- `🏠 Volver al menú`

Si elige insertar otro, volvé al paso 2 (preservá el contexto cargado en el paso 1).
