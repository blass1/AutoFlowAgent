import type { Locator, Page } from '@playwright/test';

/** Modal de login de Demoblaze (usuario / contraseña / botón Log in). */
export default class LoginPage {
  private readonly page: Page;
  private readonly inputUsuario: Locator;
  private readonly inputPassword: Locator;
  private readonly botonLogIn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.inputUsuario = page.locator('#loginusername');
    this.inputPassword = page.locator('#loginpassword');
    this.botonLogIn = page.getByRole('button', { name: 'Log in' });
  }

  async ingresar(usuario: string, password: string): Promise<void> {
    await this.inputUsuario.click();
    await this.page.waitForTimeout(500);
    await this.inputUsuario.pressSequentially(usuario);
    await this.page.waitForTimeout(500);
    await this.inputPassword.click();
    await this.page.waitForTimeout(500);
    await this.inputPassword.pressSequentially(password);
    await this.page.waitForTimeout(500);
    await this.botonLogIn.click();
    await this.page.waitForTimeout(500);
  }
}
