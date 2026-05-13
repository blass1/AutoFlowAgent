import type { Canal } from './types';

/**
 * Catálogo de canales (nombre + URL inicial) reusables al crear casos.
 * El agente AutoFlow agrega entradas acá cuando el QA elige "Crear nuevo canal".
 */
export const canales: readonly Canal[] = [
  { nombre: 'Demon blaze', url: 'https://www.demoblaze.com/' },
];
