import { type Page, type Locator } from '@playwright/test';
import { bufferEntreAcciones, screen } from '../fixtures';

/** Página de login de Demon blaze. Abre el modal e ingresa las credenciales. */
export default class LoginPage {
  private readonly page: Page;
  private readonly linkLogIn: Locator;
  private readonly inputUsername: Locator;
  private readonly inputPassword: Locator;
  private readonly botonLogIn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.linkLogIn = page.getByRole('link', { name: 'Log in' });
    this.inputUsername = page.locator('#loginusername');
    this.inputPassword = page.locator('#loginpassword');
    this.botonLogIn = page.getByRole('button', { name: 'Log in' });
  }

  /** Abre el modal de login, ingresa las credenciales y confirma. */
  async ingresar(usuario: string, pass: string): Promise<void> {
    await this.linkLogIn.click();
    await bufferEntreAcciones(this.page);
    await this.inputUsername.click();
    await bufferEntreAcciones(this.page);
    await this.inputUsername.pressSequentially(usuario);
    await bufferEntreAcciones(this.page);
    await this.inputPassword.click();
    await bufferEntreAcciones(this.page);
    await this.inputPassword.pressSequentially(pass);
    await bufferEntreAcciones(this.page);
    await this.botonLogIn.click();
    await this.page.waitForLoadState('domcontentloaded');
    await screen(this.page, 'LoginPage');
  }
}
