import type { User } from './types';
import type { DatosCompra } from '../pages/CheckoutPage';

export interface DataCompraSamsungGalaxyS6 {
  urlInicial: string;
  usuarioPrincipal: User;
  productoBuscado: string;
  datosCompra: DatosCompra;
}

export const dataCompraSamsungGalaxyS6: DataCompraSamsungGalaxyS6 = {
  urlInicial: 'https://www.demoblaze.com/',
  usuarioPrincipal: {
    canal: 'Demoblaze',
    user: 'admin',
    pass: 'admin',
  },
  productoBuscado: 'Samsung galaxy s6',
  datosCompra: {
    nombre: 'Blas Carofile',
    pais: 'Argentina',
    ciudad: 'Buenos Aires',
    tarjeta: '4111111111111111',
    mes: '12',
    anio: '2030',
  },
};
