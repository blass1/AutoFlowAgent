import { Locator, Page } from '@playwright/test';

/**
 * Sección de laptops del catálogo de Demoblaze.
 */
export default class LaptopsPage {
  private readonly linkLaptops: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly linkPrimerProducto: Locator;
  private readonly linkAgregarAlCarrito: Locator;

  constructor(private readonly page: Page) {
    this.linkLaptops = page.getByRole('link', { name: 'Laptops' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.linkPrimerProducto = page.getByRole('link').filter({ hasText: /^$/ }).first();
    this.linkAgregarAlCarrito = page.getByRole('link', { name: 'Add to cart' });
  }

  /**
   * Navega a la sección de laptops, selecciona el primer producto y lo agrega al carrito.
   */
  async agregarLaptopAlCarrito(): Promise<void> {
    await this.linkLaptops.click();
    await this.linkPrimerProducto.click();
    await this.linkAgregarAlCarrito.click();
  }
}
