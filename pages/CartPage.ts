import type { Locator, Page } from '@playwright/test';
import { bufferEntreAcciones } from '../fixtures';

/** Carrito con los items agregados + botón para iniciar la compra. */
export default class CartPage {
  private readonly page: Page;
  private readonly botonPlaceOrder: Locator;

  constructor(page: Page) {
    this.page = page;
    this.botonPlaceOrder = page.getByRole('button', { name: 'Place Order' });
  }

  async iniciarCompra(): Promise<void> {
    await this.botonPlaceOrder.click();
    await bufferEntreAcciones(this.page);
  }
}
