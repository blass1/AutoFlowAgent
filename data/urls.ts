import type { Canal } from './types';

/**
 * Catálogo de canales (nombre + URL inicial) reusables al crear casos.
 * El agente AutoFlow agrega entradas acá durante "Crear caso" cuando el QA
 * elige `➕ Crear nuevo canal`. También las consume `setup-auth.md` para
 * elegir canal al grabar un login reusable.
 * Si una URL de homologación cambia, modificala acá una sola vez.
 */
export const canales: readonly Canal[] = [
  { nombre: 'Google', url: 'https://www.google.com' },
];
