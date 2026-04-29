import { Locator, Page } from '@playwright/test';
import CelularesPage from './CelularesPage';

/**
 * Pantalla principal de Demoblaze con modal de login.
 */
export default class LoginPage {
  private readonly linkLogin: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly inputUsuario: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly inputPassword: Locator;
  private readonly botonLogin: Locator;

  constructor(private readonly page: Page) {
    this.linkLogin = page.getByRole('link', { name: 'Log in' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.inputUsuario = page.locator('#loginusername');
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.inputPassword = page.locator('#loginpassword');
    this.botonLogin = page.getByRole('button', { name: 'Log in' });
  }

  /**
   * Abre el modal de login, completa las credenciales y envía el formulario.
   * @param usuario  Nombre de usuario.
   * @param password Contraseña del usuario.
   */
  async ingresar(usuario: string, password: string): Promise<CelularesPage> {
    await this.linkLogin.click();
    await this.inputUsuario.fill(usuario);
    await this.inputPassword.fill(password);
    await this.botonLogin.click();
    return new CelularesPage(this.page);
  }
}
