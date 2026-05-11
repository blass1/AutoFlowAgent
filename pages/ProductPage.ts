import type { Locator, Page } from '@playwright/test';
import { bufferEntreAcciones } from '../fixtures';

/** Detalle de un producto + acceso al carrito desde el navbar. */
export default class ProductPage {
  private readonly page: Page;
  private readonly linkAddToCart: Locator;
  private readonly linkCart: Locator;

  constructor(page: Page) {
    this.page = page;
    this.linkAddToCart = page.getByRole('link', { name: 'Add to cart' });
    this.linkCart = page.getByRole('link', { name: 'Cart', exact: true });
  }

  async agregarAlCarrito(): Promise<void> {
    this.page.once('dialog', (d) => d.accept());
    await this.linkAddToCart.click();
    await bufferEntreAcciones(this.page);
  }

  async irAlCarrito(): Promise<void> {
    await this.linkCart.click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}
