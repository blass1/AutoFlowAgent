import type { Locator, Page } from '@playwright/test';
import { bufferEntreAcciones, expect } from '../fixtures';

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
    await bufferEntreAcciones(this.page);
    await this.inputNombre.pressSequentially(datos.nombre);
    await bufferEntreAcciones(this.page);
    await this.inputPais.click();
    await bufferEntreAcciones(this.page);
    await this.inputPais.pressSequentially(datos.pais);
    await bufferEntreAcciones(this.page);
    await this.inputCiudad.click();
    await bufferEntreAcciones(this.page);
    await this.inputCiudad.pressSequentially(datos.ciudad);
    await bufferEntreAcciones(this.page);
    await this.inputTarjeta.click();
    await bufferEntreAcciones(this.page);
    await this.inputTarjeta.pressSequentially(datos.tarjeta);
    await bufferEntreAcciones(this.page);
    await this.inputMes.click();
    await bufferEntreAcciones(this.page);
    await this.inputMes.pressSequentially(datos.mes);
    await bufferEntreAcciones(this.page);
    await this.inputAnio.click();
    await bufferEntreAcciones(this.page);
    await this.inputAnio.pressSequentially(datos.anio);
    await bufferEntreAcciones(this.page);
    await this.botonPurchase.click();
    await bufferEntreAcciones(this.page);
  }

  async verificarThankYou(): Promise<void> {
    await expect(this.tituloConfirmacion).toContainText('Thank you for your purchase!');
  }
}
