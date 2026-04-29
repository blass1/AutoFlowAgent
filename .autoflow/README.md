# `.autoflow/` — Estado y configuración del agente

Este directorio contiene los **prompts del agente AutoFlow**, sus **convenciones de código**, y el **estado runtime** de las grabaciones y test sets.

## Estructura

```
.autoflow/
├── prompts/             # sub-prompts que el agente carga según la acción del QA
├── conventions/
│   └── pom-rules.md     # reglas que el agente sigue al generar POMs y tests
├── recordings/          # archivos generados durante una sesión de grabación
├── testsets/            # un JSON por test set
├── user.json            # datos del QA (creado en el onboarding, no se commitea)
└── user.json.example    # ejemplo del shape de user.json
```

## Qué se commitea y qué no

**Sí** se commitean:
- `prompts/`, `conventions/`, este README, `user.json.example`, los `.gitkeep` de `recordings/`.

**No** se commitea (ya está en `.gitignore`):
- `user.json`
- `recordings/*` (excepto el `.gitkeep`)

> Los archivos en `testsets/` se commitean si el equipo quiere versionar los test sets. Si no, agregalos a `.gitignore`.

## Archivos de una sesión de grabación

Cuando el QA arranca "Crear caso", se generan en `recordings/`:

| Archivo | Qué tiene |
| --- | --- |
| `{numero}-session.json` | Metadata de la sesión + flag `activa: true/false` |
| `{numero}-markers.json` | Marcadores de pantalla del QA (`marcar: <nombre>`) |
| `{numero}-notes.json` | Notas del QA (`nota: <texto>`) |
| `{numero}.spec.ts` | Output crudo de `playwright codegen` |
| `{numero}-parsed.json` | Resultado de `scripts/parse-codegen-output.js` |

Después de generar los POs, los temporales (`-parsed.json`, `.spec.ts`) se borran. Los demás quedan como historial.

## Prompts disponibles

| Prompt | Para qué |
| --- | --- |
| `setup-entorno.md` | Se carga al activar el modo. Verifica `node_modules` y los browsers de Playwright; si falta algo, guía al QA para instalarlo. |
| `onboarding.md` | Primer uso — pide nombre, legajo, equipo, tribu. |
| `menu-principal.md` | Menú con las 6 acciones. |
| `crear-caso.md` | Lanza grabación con codegen. |
| `editar-caso.md` | Regrabar / editar código / append. |
| `correr-caso.md` | Corre un caso puntual. |
| `crear-test-set.md` | Agrupa casos en un test set. |
| `editar-test-set.md` | Modifica un test set existente. |
| `correr-test-set.md` | Corre todos los casos de un set. |
| `generar-pom.md` | Post-grabación — analiza, propone, genera POMs y test. |
