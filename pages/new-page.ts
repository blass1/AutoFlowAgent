import { Locator, Page } from '@playwright/test';

/**
 * Catálogo de teléfonos y detalle de producto en Demoblaze.
 *
 * @autoflow-fingerprint
 *   click | getByRole:link:Phones
 *   click | css:div:nth-child(7) > .card > a
 *   click | getByRole:link:Add to cart
 */
export default class NewPage {
  private readonly linkPhones: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly linkProducto: Locator;
  private readonly linkAgregarAlCarrito: Locator;

  constructor(private readonly page: Page) {
    this.linkPhones = page.getByRole('link', { name: 'Phones' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.linkProducto = page.locator('div:nth-child(7) > .card > a');
    this.linkAgregarAlCarrito = page.getByRole('link', { name: 'Add to cart' });
  }

  /**
   * Navega a la categoría de teléfonos.
   */
  async irAPhones(): Promise<void> {
    await this.linkPhones.click();
  }

  /**
   * Selecciona el producto de la posición 7 de la grilla.
   */
  async seleccionarProducto(): Promise<void> {
    await this.linkProducto.click();
  }

  /**
   * Agrega el producto actual al carrito.
   */
  async agregarAlCarrito(): Promise<void> {
    await this.linkAgregarAlCarrito.click();
  }
}
