import { expect, FrameLocator, Locator, Page } from '@playwright/test';

/**
 * Pantalla de Solicitud de Productos del Online Banking de ICBC.
 */
export default class ProductosPage {
  private readonly frameMenu: FrameLocator;
  private readonly tablaProductos: FrameLocator;
  private readonly linkSolicitudDeProductos: Locator;
  private readonly linkCuentas: Locator;
  private readonly linkInversiones: Locator;
  private readonly linkPrestamos: Locator;
  private readonly linkSeguros: Locator;
  private readonly linkTarjetas: Locator;
  private readonly linkPaquetes: Locator;

  constructor(private readonly page: Page) {
    this.frameMenu = page.frameLocator('frame[name="miboston"]');
    this.tablaProductos = this.frameMenu.locator('#recTable');
    this.linkSolicitudDeProductos = this.frameMenu.getByRole('link', { name: 'Solicitud de Productos' });
    this.linkCuentas = this.frameMenu.locator('#recTable').getByRole('link', { name: 'Cuentas' });
    this.linkInversiones = this.frameMenu.locator('#recTable').getByRole('link', { name: 'Inversiones' });
    this.linkPrestamos = this.frameMenu.locator('#recTable').getByRole('link', { name: 'Préstamos' });
    this.linkSeguros = this.frameMenu.locator('#recTable').getByRole('link', { name: 'Seguros' });
    this.linkTarjetas = this.frameMenu.locator('#recTable').getByRole('link', { name: 'Tarjetas' });
    this.linkPaquetes = this.frameMenu.getByRole('link', { name: 'Paquetes' });
  }

  /**
   * Navega a la sección Solicitud de Productos desde el menú principal.
   */
  async irASolicitudDeProductos(): Promise<void> {
    await this.linkSolicitudDeProductos.click();
  }

  /**
   * Verifica que las categorías de productos estén visibles.
   */
  async verificarProductos(): Promise<void> {
    await expect(this.linkCuentas).toBeVisible();
    await expect(this.linkInversiones).toBeVisible();
    await expect(this.linkPrestamos).toBeVisible();
    await expect(this.linkSeguros).toBeVisible();
    await expect(this.linkTarjetas).toBeVisible();
    await expect(this.linkPaquetes).toBeVisible();
  }
}
