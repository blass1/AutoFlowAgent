# `utils/` — utilidades complementarias del QA

Carpeta para librerías auxiliares que el QA quiere conectar al proyecto (reporting, hooks personalizados, helpers de notificación, etc.). El agente AutoFlow las descubre desde el menú principal `🔧 Utilidades` y las aplica en el código del proyecto siguiendo las instrucciones que dejes en el header del archivo.

## Convención del header

Cada utilidad arranca con un bloque de comentarios al tope con tags estructurados. El agente lee esos tags para entender qué hace, dónde aplicarla y cómo. Si el header está mal formado o ambiguo, el agente **frena** y te pide que lo afines — no inventa.

### Tags soportados

| Tag | Obligatorio | Qué pone |
| --- | --- | --- |
| `@autoflow-util <nombre>` | sí | Nombre canónico de la utilidad. Identifica la entrada en `.autoflow/utils-applied.json`. |
| `@descripcion` | sí | 1–3 líneas. Lo que el QA ve en la lista del menú. |
| `@aplicarEn <target>` | sí | Pista estructurada del archivo destino. Valores: `fixtures` · `playwright-config` · `page-base` · `spec-helper`. Si tu util toca varios, listalos separados por coma. |
| `@como-aplicar` | sí | Instrucciones en castellano, paso a paso, con bloques de código. El agente las lee y arma el plan de cambios. |
| `@verificar` | opcional | Cómo confirmar que quedó aplicada (qué deberías ver). |
| `@desinstalar` | opcional | Instrucciones para revertir. Si no está, el agente te avisa y tenés que desinstalar a mano. |

### Ejemplo: `pdfReporter.ts`

```ts
/**
 * @autoflow-util pdfReporter
 *
 * @descripcion
 * Genera un PDF con el reporte de cada Test en formato corporativo.
 * Incluye screenshots por step, tiempos y datos del QA del user.json.
 *
 * @aplicarEn fixtures
 *
 * @como-aplicar
 * 1. Sumar al tope de fixtures/index.ts:
 *    import { generarPDF } from '../utils/pdfReporter';
 *
 * 2. Sumar este hook al final del archivo de fixtures (después del export
 *    de test/expect):
 *    ```ts
 *    test.afterEach(async ({ page }, testInfo) => {
 *      await generarPDF(testInfo, page);
 *    });
 *    ```
 *    Si ya existe un afterEach, sumá la línea adentro sin duplicar el bloque.
 *
 * 3. Crear la carpeta reportes/ si no existe (la usa la lib internamente).
 *
 * @verificar
 * Correr cualquier Test → debería aparecer reportes/{testId}.pdf.
 *
 * @desinstalar
 * 1. Quitar el import de fixtures/index.ts.
 * 2. Quitar el bloque test.afterEach (o solo la línea si hay otros hooks).
 */

import type { TestInfo, Page } from '@playwright/test';

export async function generarPDF(testInfo: TestInfo, page: Page): Promise<void> {
  // ... tu implementación ...
}
```

## Reglas

- **Una utilidad = un archivo** en `utils/` con extensión `.ts` o `.js`.
- El agente solo procesa archivos con header `@autoflow-util` válido. Si falta, lo lista pero no lo aplica.
- **Idempotencia**: el agente, antes de insertar una línea, verifica si ya está en el archivo destino. No duplica.
- **Confirmación por utilidad**: el agente siempre muestra un preview de los cambios y pide tu confirmación antes de tocar archivos.
- **Estado**: las utilidades aplicadas se anotan en `.autoflow/utils-applied.json`. Sirve para que el menú muestre el estado y para que `@desinstalar` sepa qué revertir.

## Cuando el agente frena

- Si el header no tiene `@autoflow-util` o `@como-aplicar` → la utilidad aparece marcada `⚠️ sin instrucciones`, no se ofrece para aplicar.
- Si las instrucciones son ambiguas (no sabe qué archivo tocar, dónde insertar, qué línea reemplazar) → frena antes de tocar nada y te pide que afines el header. Mejor que inventar y romper.
