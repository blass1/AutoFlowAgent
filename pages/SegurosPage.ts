import { expect, Locator, Page } from '@playwright/test';

/**
 * Sección de Seguros dentro del Home Banking de ICBC.
 */
export default class SegurosPage {
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly linkSeguros: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly contenedorSeguros: Locator;

  constructor(private readonly page: Page) {
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.linkSeguros = page
      .locator('frame[name="miboston"]')
      .contentFrame()
      .getByRole('link', { name: 'Seguros' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.contenedorSeguros = page
      .locator('frame[name="miboston"]')
      .contentFrame()
      .locator('frame[name="content"]')
      .contentFrame()
      .locator('#readerContent');
  }

  /**
   * Navega a la sección de Seguros haciendo click en el link del menú.
   */
  async irASeguros(): Promise<void> {
    await this.linkSeguros.click();
  }

  /**
   * Verifica que el contenido de la sección muestre la opción de cotizar seguro.
   */
  async verificarCotizarSeguro(): Promise<void> {
    await expect(this.contenedorSeguros).toContainText('Cotizar Seguro');
  }
}
