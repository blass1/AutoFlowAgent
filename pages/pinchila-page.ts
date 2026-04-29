import { Locator, Page } from '@playwright/test';

/**
 * Flujo completo de login y compra de laptop en Demoblaze.
 *
 * @autoflow-fingerprint
 *   goto  | https://www.demoblaze.com/index.html
 *   click | getByRole:link:Log in
 *   click | css:#loginusername
 *   fill  | css:#loginusername  | *
 *   press | css:#loginusername  | Tab
 *   click | css:#loginpassword
 *   fill  | css:#loginpassword  | *
 *   click | getByRole:button:Log in
 *   click | getByRole:link:Laptops
 *   click | getByRole:link:nth:1
 *   click | getByRole:link:Add to cart
 *   click | getByRole:link:Cart
 *   click | getByRole:button:Place Order
 */
export default class PinchilaPage {
  private readonly linkLogIn: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly inputUsuario: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly inputPassword: Locator;
  private readonly botonLogIn: Locator;
  private readonly linkLaptops: Locator;
  // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
  private readonly linkProducto: Locator;
  private readonly linkAgregarAlCarrito: Locator;
  private readonly linkCarrito: Locator;
  private readonly botonPlaceOrder: Locator;

  constructor(private readonly page: Page) {
    this.linkLogIn = page.getByRole('link', { name: 'Log in' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.inputUsuario = page.locator('#loginusername');
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.inputPassword = page.locator('#loginpassword');
    this.botonLogIn = page.getByRole('button', { name: 'Log in' });
    this.linkLaptops = page.getByRole('link', { name: 'Laptops' });
    // FIXME: selector frágil, pedir data-testid al equipo de desarrollo.
    this.linkProducto = page.getByRole('link').filter({ hasText: /^$/ }).nth(1);
    this.linkAgregarAlCarrito = page.getByRole('link', { name: 'Add to cart' });
    this.linkCarrito = page.getByRole('link', { name: 'Cart', exact: true });
    this.botonPlaceOrder = page.getByRole('button', { name: 'Place Order' });
  }

  /**
   * Navega a la URL inicial de Demoblaze.
   */
  async navegar(): Promise<void> {
    await this.page.goto('https://www.demoblaze.com/index.html');
  }

  /**
   * Abre el modal de login.
   */
  async abrirLogin(): Promise<void> {
    await this.linkLogIn.click();
  }

  /**
   * Ingresa con usuario y contraseña.
   * @param usuario  Nombre de usuario.
   * @param password Contraseña.
   */
  async ingresar(usuario: string, password: string): Promise<void> {
    await this.inputUsuario.fill(usuario);
    await this.inputUsuario.press('Tab');
    await this.inputPassword.fill(password);
    await this.botonLogIn.click();
  }

  /**
   * Navega a la categoría de laptops, selecciona el primer producto y lo agrega al carrito.
   */
  async agregarLaptopAlCarrito(): Promise<void> {
    await this.linkLaptops.click();
    await this.linkProducto.click();
    await this.linkAgregarAlCarrito.click();
  }

  /**
   * Navega al carrito e inicia el proceso de orden.
   */
  async iniciarOrden(): Promise<void> {
    await this.linkCarrito.click();
    await this.botonPlaceOrder.click();
  }
}
