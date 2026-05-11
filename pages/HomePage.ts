import type { Locator, Page } from '@playwright/test';
import { bufferEntreAcciones, expect } from '../fixtures';

/** Pantalla principal de Demoblaze (home + navbar global). */
export default class HomePage {
  private readonly page: Page;
  private readonly linkLogin: Locator;
  private readonly tituloUsuario: Locator;
  private readonly linkProducto: (nombre: string) => Locator;

  constructor(page: Page) {
    this.page = page;
    this.linkLogin = page.getByRole('link', { name: 'Log in' });
    this.tituloUsuario = page.locator('#nameofuser');
    this.linkProducto = (nombre: string) => page.getByRole('link', { name: nombre });
  }

  async abrirModalLogin(): Promise<void> {
    await this.linkLogin.click();
    await bufferEntreAcciones(this.page);
  }

  async verificarWelcome(usuario: string): Promise<void> {
    await expect(this.tituloUsuario).toContainText(`Welcome ${usuario}`);
  }

  async elegirProducto(nombre: string): Promise<void> {
    await this.linkProducto(nombre).click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}
