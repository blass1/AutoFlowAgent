import { expect, FrameLocator, Locator, Page } from '@playwright/test';

/**
 * Pantalla de cuentas del Online Banking de ICBC.
 */
export default class CuentasPage {
  private readonly frameMenu: FrameLocator;
  private readonly frameCuentas: FrameLocator;
  private readonly linkCuentas: Locator;
  private readonly celdaCA: Locator;
  private readonly celdaCC: Locator;
  private readonly celdaCAUSD: Locator;
  private readonly celdaSaldos: Locator;

  constructor(private readonly page: Page) {
    this.frameMenu = page.frameLocator('frame[name="miboston"]');
    this.frameCuentas = this.frameMenu.frameLocator('frame[name="content"]');
    this.linkCuentas = this.frameMenu.getByRole('link', { name: 'Cuentas' });
    this.celdaCA = this.frameCuentas.getByRole('cell', { name: 'CA $', exact: true });
    this.celdaCC = this.frameCuentas.getByRole('cell', { name: 'CC $', exact: true });
    this.celdaCAUSD = this.frameCuentas.getByRole('cell', { name: 'CA U$S', exact: true });
    this.celdaSaldos = this.frameCuentas.getByRole('cell', { name: 'Saldos de Cuentas' });
  }

  /**
   * Navega a la sección Cuentas desde el menú principal.
   */
  async irACuentas(): Promise<void> {
    await this.linkCuentas.click();
  }

  /**
   * Verifica que las cuentas principales estén visibles (CA $, CC $, CA U$S).
   */
  async verificarCuentas(): Promise<void> {
    await expect(this.celdaCA).toBeVisible();
    await expect(this.celdaCC).toBeVisible();
    await expect(this.celdaCAUSD).toBeVisible();
  }

  /**
   * Verifica que el encabezado "Saldos de Cuentas" esté visible.
   */
  async verificarEncabezado(): Promise<void> {
    await expect(this.celdaSaldos).toBeVisible();
  }
}
