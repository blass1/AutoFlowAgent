/**
 * Parsers reusables para nodos `capturar` / `verificar`.
 *
 * Cada parser recibe el `string` crudo (resultado de `textContent()` o `getAttribute`)
 * y lo convierte al tipo que la condición de comparación espera.
 *
 * Si el QA pasa una `regex` al nodo, el agente la aplica antes de invocar el parser:
 * el parser siempre recibe ya el string limpio.
 */

export type ParserName = 'text' | 'number' | 'currency-arg' | 'date';

export function parseText(raw: string): string {
  return raw.trim();
}

/** number genérico: acepta separador `.` o `,` como decimal. Usar cuando no sabés el locale. */
export function parseNumber(raw: string): number {
  const s = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '.');
  const ultimoPunto = s.lastIndexOf('.');
  const limpio = ultimoPunto === -1
    ? s
    : s.slice(0, ultimoPunto).replace(/\./g, '') + '.' + s.slice(ultimoPunto + 1);
  const n = Number.parseFloat(limpio);
  if (Number.isNaN(n)) {
    throw new Error(`parseNumber: no pude parsear "${raw}"`);
  }
  return n;
}

/** Moneda formato AR: `$ 1.234,56` → 1234.56. */
export function parseCurrencyAR(raw: string): number {
  const s = raw.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) {
    throw new Error(`parseCurrencyAR: no pude parsear "${raw}"`);
  }
  return n;
}

/** Fecha → timestamp ms para poder comparar con <, >, ==. */
export function parseDate(raw: string): number {
  const t = Date.parse(raw.trim());
  if (Number.isNaN(t)) {
    throw new Error(`parseDate: no pude parsear "${raw}"`);
  }
  return t;
}

export const parsers: Record<ParserName, (raw: string) => string | number> = {
  text: parseText,
  number: parseNumber,
  'currency-arg': parseCurrencyAR,
  date: parseDate,
};
