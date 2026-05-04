import type { User } from './types';

/**
 * Catálogo de usuarios de prueba (homologación).
 *
 * Una entrada por usuario. La key describe el escenario + canal en camelCase
 * (ej: `qaIcbcEstandar`, `clienteVipDemoblaze`). El agente AutoFlow agrega
 * usuarios acá durante "Crear caso" (paso 8.a de generar-pom.md).
 *
 * Si una contraseña cambia en homologación, cambiala acá una sola vez y se
 * propaga a todos los `data-{slugTestSet}.ts` que la referencian.
 */
export const usuarios = {} as const satisfies Record<string, User>;
