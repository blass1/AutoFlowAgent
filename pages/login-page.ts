import { Locator, Page } from '@playwright/test';
import PhonePage from './phone-page';

/**
 * Pantalla principal con modal de login de Demoblaze.
 *
 * @autoflow-fingerprint
 *   goto  | https://www.demoblaze.com/index.html
 *   click | getByRole:link:Log in
 *   click | css:#loginusername
 *   fill  | css:#loginusername  | *
 *   click | css:#loginpassword
 *   fill  | css:#loginpassword  | *
 *   click | getByRole:button:Log in
 */
export default class LoginPage {
  private readonly linkLogIn: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly inputUsuario: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly inputPassword: Locator;
  private readonly botonLogIn: Locator;

  constructor(private readonly page: Page) {
    this.linkLogIn = page.getByRole('link', { name: 'Log in' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.inputUsuario = page.locator('#loginusername');
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.inputPassword = page.locator('#loginpassword');
    this.botonLogIn = page.getByRole('button', { name: 'Log in' });
  }

  /**
   * Navega a la URL inicial de Demoblaze.
   */
  async navegar(): Promise<void> {
    await this.page.goto('https://www.demoblaze.com/index.html');
  }

  /**
   * Abre el modal de login.
   */
  async abrirLogin(): Promise<void> {
    await this.linkLogIn.click();
  }

  /**
   * Ingresa con usuario y contraseña y navega al catálogo.
   * @param usuario  Nombre de usuario.
   * @param password Contraseña.
   */
  async ingresar(usuario: string, password: string): Promise<PhonePage> {
    await this.inputUsuario.fill(usuario);
    await this.inputPassword.fill(password);
    await this.botonLogIn.click();
    return new PhonePage(this.page);
  }
}
