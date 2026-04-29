import { Locator, Page } from '@playwright/test';
import CarritoPage from './CarritoPage';

/**
 * Sección de celulares (Phones) del catálogo de Demoblaze.
 */
export default class CelularesPage {
  private readonly linkCelulares: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly linkPrimerProducto: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly linkSegundoProducto: Locator;
  private readonly linkAgregarAlCarrito: Locator;
  private readonly linkHome: Locator;

  constructor(private readonly page: Page) {
    this.linkCelulares = page.getByRole('link', { name: 'Phones' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.linkPrimerProducto = page.getByRole('link').filter({ hasText: /^$/ }).first();
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.linkSegundoProducto = page.getByRole('link').filter({ hasText: /^$/ }).nth(4);
    this.linkAgregarAlCarrito = page.getByRole('link', { name: 'Add to cart' });
    this.linkHome = page.getByRole('link', { name: 'Home (current)' });
  }

  /**
   * Navega a la sección de celulares, selecciona el primer producto y lo agrega al carrito.
   */
  async agregarPrimerCelularAlCarrito(): Promise<void> {
    await this.linkCelulares.click();
    await this.linkPrimerProducto.click();
    await this.linkAgregarAlCarrito.click();
  }

  /**
   * Vuelve al inicio, navega a celulares, selecciona el cuarto producto y lo agrega al carrito.
   */
  async agregarSegundoCelularAlCarrito(): Promise<void> {
    await this.linkHome.click();
    await this.linkCelulares.click();
    await this.linkSegundoProducto.click();
    await this.linkAgregarAlCarrito.click();
  }
}
