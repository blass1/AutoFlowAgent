import { test, expect } from '../fixtures/index';
import LoginPage from '../pages/login-page';
import PhonePage from '../pages/phone-page';
import CartPage from '../pages/cart-page';
import PinchilaPage from '../pages/pinchila-page';
import NewPage from '../pages/new-page';

test('TC-1234 Login con compra', async ({ page }) => {
  const login = new LoginPage(page);
  await login.navegar();
  await login.abrirLogin();
  const phones: PhonePage = await login.ingresar('admin', 'admin');

  await phones.irAPhones();
  await phones.seleccionarProducto();
  const cart: CartPage = await phones.agregarAlCarrito();

  await cart.irAlCarrito();
  await cart.seleccionarProducto('Iphone 6 32gb');
});

test('TC-1234 Login con carrito de notebook', async ({ page }) => {
  const pinchila = new PinchilaPage(page);
  await pinchila.navegar();
  await pinchila.abrirLogin();
  await pinchila.ingresar('admin', 'admin');
  await pinchila.agregarLaptopAlCarrito();
  await pinchila.iniciarOrden();
});

test('TC-12333 Login con phone', async ({ page }) => {
  const login = new LoginPage(page);
  await login.navegar();
  await login.abrirLogin();
  await login.ingresar('admin', 'admin');

  const newPage = new NewPage(page);
  await newPage.irAPhones();
  await newPage.seleccionarProducto();
  await newPage.agregarAlCarrito();
});
