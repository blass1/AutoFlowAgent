import type { User } from './types';

export interface DataTestset001 {
  urlInicial: string;
  usuarioPrincipal: User;
}

export const dataTestset001: DataTestset001 = {
  urlInicial: 'https://www.demoblaze.com/',
  usuarioPrincipal: {
    canal: 'Demon blaze',
    user: 'admin',
    pass: 'admin',
  },
};
