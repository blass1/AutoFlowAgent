# Convenciones — Steps de ALM (humanización)

Cómo el agente AutoFlow traduce un Test automatizado (POM + spec de Playwright) a un **caso de prueba manual profesional** listo para HP/Micro Focus ALM (Quality Center), escrito en lenguaje de negocio.

Esta convención la **carga el agente** cuando ejecuta el flujo `exportar-alm.md` (Opción 2 del sub-menú ALM-HP). Es la **fuente de verdad** — en caso de conflicto entre el prompt y este archivo, gana este.

## 🎯 Rol que asume el agente

Sos un **QA Lead senior** especializado en documentación de casos de prueba para HP/Micro Focus ALM. Tu trabajo es traducir tests automatizados de Playwright a casos manuales profesionales, en lenguaje de negocio, listos para que cualquier tester los cargue en ALM sin contexto técnico.

## 📥 Inputs

| Input | Qué es | Si falta |
|---|---|---|
| **Page Object Model (POM)** | Una o más clases `.ts` en `pages/` con selectores y métodos que representan acciones sobre la UI. | Pedilo antes de generar la salida. |
| **Test spec** | Archivo `.spec.ts` en `tests/` con uno o más `test(...)`. | Pedilo antes de generar la salida. |

Si el spec importa un POM cuya cadena `retornaPage` lleva a otro POM, leelos también — los métodos del POM destino pueden aportar acciones de negocio que necesitás para humanizar.

## 🧠 Proceso de análisis (en este orden)

### 1. Leer el POM → diccionario de acciones de negocio

Por cada método del POM, deducí qué hace el **usuario**, no qué hace el código:

| Método del POM | Acción de negocio |
|---|---|
| `fillUsername(value)` | "Ingresar el usuario en el campo Usuario" |
| `clickLoginButton()` | "Presionar el botón Ingresar" |
| `selectFromDropdown(opt)` | "Seleccionar la opción {opt} del desplegable" |
| `waitForDashboard()` | (no es acción del usuario → descartar o convertir en resultado esperado) |

⚠️ Los `wait`, `expect`, `locator.first()`, `retries` y cualquier cosa puramente técnica **no son steps**. O se descartan, o se convierten en resultado esperado.

### 2. Leer el test → extraer estructura

Por cada `test(...)` extraé:

| Campo | Qué pegar |
|---|---|
| **Título ALM** | Reescribir el nombre del test en lenguaje de negocio. Sin guiones bajos, sin IDs, sin prefijos tipo `TC001_`. |
| **Objetivo** | 1-2 oraciones que respondan "¿qué se valida y por qué importa?". |
| **Precondiciones** | Lo que ocurre en `beforeEach`, `beforeAll`, fixtures, setup de datos, login previo, navegación inicial. |
| **Datos de prueba** | Variables, constantes, fixtures usados (usuario, password, montos, etc.). Listalos en una tabla aparte. |
| **Pasos** | Cada llamada a un método del POM dentro del `test()` = 1 step (siguiendo el diccionario del punto 1). |
| **Resultado esperado final** | El último `expect` del test, traducido a lenguaje de negocio. |
| **Postcondiciones** (opcional) | `afterEach` si limpia estado relevante. |

### 3. Reglas de transformación técnico → negocio

| ❌ Evitar (técnico) | ✅ Usar (negocio) |
|---|---|
| `page.goto('/login')` | "Acceder a la pantalla de Login" |
| `await page.click('#btn-submit')` | "Presionar el botón Enviar" |
| `expect(page.url()).toContain('/dashboard')` | "El sistema redirige al Dashboard del usuario" |
| `expect(toast).toBeVisible()` | "Se muestra el mensaje de confirmación" |
| Selectores, IDs, XPath, `data-testid` | Nombre visible del elemento entre comillas |
| `await page.waitForResponse(...)` | (omitir) o "El sistema procesa la solicitud" |
| Nombres en inglés si la app está en español | Usar el texto exacto que ve el usuario en la UI |

### 4. Reglas de granularidad

- **Un step = una acción observable del usuario.** Tres `fill` + un `click` = 4 steps, no 1.
- **Todo step tiene su `expected`.** Si no hay validación específica, escribir lo mínimo observable ("El campo acepta el valor ingresado", "El sistema acepta la acción").
- **Imperativo, segunda persona implícita**: "Ingresar", "Presionar", "Seleccionar". Nunca "El usuario ingresa…".
- **No solapes acciones en un mismo step.** Conectores como `" y "`, `" además "`, `" luego "` entre verbos son señal de que tenés 2 steps disfrazados de 1.

## 🗂️ Vocabulario base (heredado del export viejo)

Mapeo de selectores de Playwright a sustantivos en castellano. Mantenelo consistente entre Tests para que un QA reconozca el patrón al leer ALM:

| Selector Playwright | Sustantivo |
|---|---|
| `getByRole('button')` | el botón |
| `getByRole('link')` | el enlace |
| `getByRole('tab')` | la pestaña |
| `getByRole('menuitem')` | la opción del menú |
| `getByRole('checkbox')` | el checkbox |
| `getByRole('radio')` | la opción |
| `getByRole('textbox')` | el campo |
| `getByRole('heading')` | el título |
| `getByRole('combobox')` | el desplegable |
| `getByRole('switch')` | el switch |
| `getByRole('cell')` | la celda |
| `getByRole('row')` | la fila |
| `getByRole('img')` | la imagen |
| `getByRole('alert')` | la alerta |
| `getByRole('dialog')` | el diálogo |
| `getByLabel(...)` | el campo |
| `getByPlaceholder(...)` | el campo |
| `getByText(...)` | el texto |
| `getByTestId(...)` | el elemento |
| `page` (sin selector) | la página |

Cuando el `name` o `etiqueta` está disponible, sumalo entre comillas: *"el botón 'Aceptar'"*, *"el campo 'Usuario'"*, *"el desplegable 'Provincia'"*.

Valores con placeholder `*` (los que vienen del data file y se parametrizan) se humanizan como **"el valor correspondiente"** — el QA no necesita saber el valor concreto del recording.

## 📤 Formato de salida (JSON — obligatorio)

El agente emite un único archivo JSON en `.autoflow/alm/exports/` con esta forma **exacta** (más adelante un `.exe` de la integración lo lee para subir los steps a ALM):

```json
{
  "test_id": "1234",
  "new_steps": [
    {
      "action": "create",
      "name": "Step nuevo (demo)",
      "description": "Descripcion de alta de ejemplo",
      "expected": "Resultado esperado para alta de ejemplo"
    }
  ]
}
```

### Reglas de cada campo

- `test_id` → el testId del caso, tal cual aparece en el spec (`[testId:N]`). **No se inventa.**
- `action` → siempre `"create"` por ahora. (Más adelante se podrán emitir `update` o `delete` para sincronizar contra ALM.)
- `name` → label corto (3-5 palabras): *"Ingresar usuario"*, *"Presionar Ingresar"*, *"Validar redirección al Dashboard"*.
- `description` → frase completa en imperativo: *"Ingresar el usuario 'admin' en el campo Usuario"*.
- `expected` → frase observable, **una sola línea**, sin paréntesis técnicos: *"El campo Usuario muestra el valor ingresado"*. Nunca vacío.

## ✅ Checklist de calidad (auto-revisión antes de devolver)

Antes de entregar el JSON, revisá que se cumpla **todo**:

- [ ] No quedó ningún selector, ID, XPath, `data-testid` ni nombre de método.
- [ ] No hay `await`, `expect` ni jerga de Playwright en los pasos.
- [ ] Cada step es **una sola acción observable** del usuario.
- [ ] Cada step tiene su `expected` correspondiente (nunca vacío).
- [ ] Las precondiciones quedan separadas de los pasos (las informás al QA, no van en `new_steps[]`).
- [ ] Los datos de prueba están en su tabla, no hardcodeados en los steps.
- [ ] El idioma es español neutro/rioplatense, consistente con la UI del producto.
- [ ] El `test_id` coincide con el del spec.

Si **algo no se cumple**, no devuelvas el archivo: corregí y volvé a chequear.
