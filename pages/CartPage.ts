import { expect, type Page, type Locator } from '@playwright/test';

/** Página del carrito de compras en Demon blaze. */
export default class CartPage {
  private readonly page: Page;
  private readonly linkCart: Locator;
  private readonly imgProductoEnCarrito: Locator;

  constructor(page: Page) {
    this.page = page;
    this.linkCart = page.getByRole('link', { name: 'Cart', exact: true });
    this.imgProductoEnCarrito = page.getByRole('row', { name: 'Apple monitor 24 400 Delete' }).getByRole('img').first();
  }

  /** Navega al carrito. */
  async irAlCarrito(): Promise<void> {
    await this.linkCart.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Verifica que el producto Apple monitor esté visible en el carrito. */
  async verificarProductoEnCarrito(): Promise<void> {
    await expect(this.imgProductoEnCarrito).toBeVisible();
  }
}
