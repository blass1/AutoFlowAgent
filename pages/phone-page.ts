import { Locator, Page } from '@playwright/test';
import CartPage from './cart-page';

/**
 * Catálogo de teléfonos y detalle de producto en Demoblaze.
 *
 * @autoflow-fingerprint
 *   click | getByRole:link:Phones
 *   click | getByRole:link:nth:4
 *   click | getByRole:link:Add to cart
 */
export default class PhonePage {
  private readonly linkPhones: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly linkProducto: Locator;
  private readonly linkAgregarAlCarrito: Locator;

  constructor(private readonly page: Page) {
    this.linkPhones = page.getByRole('link', { name: 'Phones' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.linkProducto = page.getByRole('link').filter({ hasText: /^$/ }).nth(4);
    this.linkAgregarAlCarrito = page.getByRole('link', { name: 'Add to cart' });
  }

  /**
   * Navega a la categoría de teléfonos.
   */
  async irAPhones(): Promise<void> {
    await this.linkPhones.click();
  }

  /**
   * Selecciona el primer producto de la lista.
   */
  async seleccionarProducto(): Promise<void> {
    await this.linkProducto.click();
  }

  /**
   * Agrega el producto actual al carrito.
   */
  async agregarAlCarrito(): Promise<CartPage> {
    await this.linkAgregarAlCarrito.click();
    return new CartPage(this.page);
  }
}
