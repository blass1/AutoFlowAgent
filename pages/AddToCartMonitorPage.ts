import { expect, type Page, type Locator } from '@playwright/test';
import { bufferEntreAcciones } from '../fixtures';

/** Listado de monitores y detalle del producto Apple monitor en Demon blaze. */
export default class AddToCartMonitorPage {
  private readonly page: Page;
  private readonly linkAppleMonitor: Locator;
  private readonly headingAppleMonitor: Locator;
  private readonly linkAddToCart: Locator;

  constructor(page: Page) {
    this.page = page;
    this.linkAppleMonitor = page.getByRole('link', { name: 'Apple monitor' });
    this.headingAppleMonitor = page.getByRole('heading', { name: 'Apple monitor' });
    this.linkAddToCart = page.getByRole('link', { name: 'Add to cart' });
  }

  /** Verifica que el producto Apple monitor sea visible en el listado. */
  async verificarAppleMonitorVisible(): Promise<void> {
    await expect(this.linkAppleMonitor).toBeVisible();
  }

  /** Navega al detalle del producto Apple monitor. */
  async seleccionarAppleMonitor(): Promise<void> {
    await this.linkAppleMonitor.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Verifica que el título del producto sea visible en la página de detalle. */
  async verificarTituloVisible(): Promise<void> {
    await expect(this.headingAppleMonitor).toBeVisible();
  }

  /** Agrega el producto Apple monitor al carrito. */
  async agregarAlCarrito(): Promise<void> {
    await this.linkAddToCart.click();
    await bufferEntreAcciones(this.page);
  }
}
