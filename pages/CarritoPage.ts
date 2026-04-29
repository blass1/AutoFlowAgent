import { expect, Locator, Page } from '@playwright/test';

/**
 * Pantalla del carrito de compras de Demoblaze.
 */
export default class CarritoPage {
  private readonly linkCarrito: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly tablaProductos: Locator;

  constructor(private readonly page: Page) {
    this.linkCarrito = page.getByRole('link', { name: 'Cart', exact: true });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.tablaProductos = page.locator('#tbodyid');
  }

  /**
   * Navega al carrito de compras.
   */
  async irAlCarrito(): Promise<void> {
    await this.linkCarrito.click();
  }

  /**
   * Verifica que un producto sea visible en la tabla del carrito.
   * @param nombre Nombre del producto a verificar.
   */
  async verificarProductoEnCarrito(nombre: string): Promise<void> {
    await expect(this.page.getByRole('cell', { name: nombre }).first()).toBeVisible();
    await expect(this.tablaProductos).toContainText(nombre);
  }
}
