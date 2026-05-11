import type { Locator, Page } from '@playwright/test';
import { expect } from '../fixtures';

export interface DatosCompra {
  nombre: string;
  pais: string;
  ciudad: string;
  tarjeta: string;
  mes: string;
  anio: string;
}

/** Modal de checkout: nombre, país, ciudad, datos de tarjeta y compra. */
export default class CheckoutPage {
  private readonly page: Page;
  private readonly inputNombre: Locator;
  private readonly inputPais: Locator;
  private readonly inputCiudad: Locator;
  private readonly inputTarjeta: Locator;
  private readonly inputMes: Locator;
  private readonly inputAnio: Locator;
  private readonly botonPurchase: Locator;
  private readonly tituloConfirmacion: Locator;

  constructor(page: Page) {
    this.page = page;
    this.inputNombre = page.locator('#name');
    this.inputPais = page.locator('#country');
    this.inputCiudad = page.locator('#city');
    this.inputTarjeta = page.locator('#card');
    this.inputMes = page.locator('#month');
    this.inputAnio = page.locator('#year');
    this.botonPurchase = page.getByRole('button', { name: 'Purchase' });
    this.tituloConfirmacion = page.locator('.sweet-alert h2');
  }

  async comprar(datos: DatosCompra): Promise<void> {
    await this.inputNombre.click();
    await this.page.waitForTimeout(500);
    await this.inputNombre.pressSequentially(datos.nombre);
    await this.page.waitForTimeout(500);
    await this.inputPais.click();
    await this.page.waitForTimeout(500);
    await this.inputPais.pressSequentially(datos.pais);
    await this.page.waitForTimeout(500);
    await this.inputCiudad.click();
    await this.page.waitForTimeout(500);
    await this.inputCiudad.pressSequentially(datos.ciudad);
    await this.page.waitForTimeout(500);
    await this.inputTarjeta.click();
    await this.page.waitForTimeout(500);
    await this.inputTarjeta.pressSequentially(datos.tarjeta);
    await this.page.waitForTimeout(500);
    await this.inputMes.click();
    await this.page.waitForTimeout(500);
    await this.inputMes.pressSequentially(datos.mes);
    await this.page.waitForTimeout(500);
    await this.inputAnio.click();
    await this.page.waitForTimeout(500);
    await this.inputAnio.pressSequentially(datos.anio);
    await this.page.waitForTimeout(500);
    await this.botonPurchase.click();
    await this.page.waitForTimeout(500);
  }

  async verificarThankYou(): Promise<void> {
    await expect(this.tituloConfirmacion).toContainText('Thank you for your purchase!');
  }
}
