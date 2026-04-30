import { Locator, Page } from '@playwright/test';

/**
 * Pantalla de acceso al Online Banking de ICBC (variante con Enter + click INGRESAR).
 */
export default class Login3Page {
  private readonly linkOnlineBanking: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly inputUsuario: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly inputPassword: Locator;
  private readonly botonIngresar: Locator;

  constructor(private readonly page: Page) {
    this.linkOnlineBanking = page.getByRole('link', { name: 'Online Banking', exact: true });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.inputUsuario = page.locator('#usuario');
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.inputPassword = page.locator('#password');
    this.botonIngresar = page.getByRole('button', { name: 'INGRESAR' });
  }

  /**
   * Navega a la home de personas y abre el Online Banking.
   */
  async abrirOnlineBanking(): Promise<void> {
    await this.page.goto('https://www.icbc.com.ar/personas');
    await this.linkOnlineBanking.click();
  }

  /**
   * Ingresa con usuario y contraseña, presiona Enter y hace click en INGRESAR.
   * @param usuario  Nombre de usuario.
   * @param password Contraseña.
   */
  async ingresar(usuario: string, password: string): Promise<void> {
    await this.inputUsuario.click();
    await this.inputUsuario.fill(usuario);
    await this.inputPassword.click();
    await this.inputPassword.fill(password);
    await this.inputPassword.press('Enter');
    await this.botonIngresar.click();
  }
}
