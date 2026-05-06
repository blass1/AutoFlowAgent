/** Usuario de prueba — shape compartido por toda la suite. */
export interface User {
  canal: string;
  user: string;
  pass: string;
  dni?: string;
}

/** Canal de prueba — nombre + URL inicial desde donde arranca un caso. */
export interface Canal {
  nombre: string;
  url: string;
}
