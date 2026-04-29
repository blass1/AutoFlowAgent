import { Locator, Page } from '@playwright/test';

/**
 * Carrito de compras de Demoblaze.
 *
 * @autoflow-fingerprint
 *   click | getByRole:link:Cart
 *   click | getByRole:cell:Iphone 6 32gb
 */
export default class CartPage {
  private readonly linkCarrito: Locator;

  constructor(private readonly page: Page) {
    this.linkCarrito = page.getByRole('link', { name: 'Cart', exact: true });
  }

  /**
   * Navega al carrito de compras.
   */
  async irAlCarrito(): Promise<void> {
    await this.linkCarrito.click();
  }

  /**
   * Selecciona un producto del carrito por nombre.
   * @param nombre Nombre del producto a seleccionar.
   */
  async seleccionarProducto(nombre: string): Promise<void> {
    await this.page.getByRole('cell', { name: nombre }).click();
  }
}
