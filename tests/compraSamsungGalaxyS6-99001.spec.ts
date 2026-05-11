import { test } from '../fixtures';
import { dataCompraSamsungGalaxyS6 } from '../data';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import ProductPage from '../pages/ProductPage';
import CartPage from '../pages/CartPage';
import CheckoutPage from '../pages/CheckoutPage';

test.describe('Compra Samsung Galaxy S6 [testSetId:99001]', () => {
  test('Compra de Samsung Galaxy S6 con usuario admin [testId:99001]', async ({ page }) => {
    const { urlInicial, usuarioPrincipal, productoBuscado, datosCompra } = dataCompraSamsungGalaxyS6;

    const homePage = new HomePage(page);
    const loginPage = new LoginPage(page);
    const productPage = new ProductPage(page);
    const cartPage = new CartPage(page);
    const checkoutPage = new CheckoutPage(page);

    await test.step('Abrir el sitio', async () => {
      await page.goto(urlInicial);
    });

    await test.step('Abrir el modal de login', async () => {
      await homePage.abrirModalLogin();
    });

    await test.step('Loguearse con admin/admin', async () => {
      await loginPage.ingresar(usuarioPrincipal.user, usuarioPrincipal.pass);
    });

    await test.step('Verificar que cargó el welcome', async () => {
      await homePage.verificarWelcome(usuarioPrincipal.user);
    });

    await test.step('Elegir el producto Samsung Galaxy S6', async () => {
      await homePage.elegirProducto(productoBuscado);
    });

    await test.step('Agregar al carrito', async () => {
      await productPage.agregarAlCarrito();
    });

    await test.step('Ir al carrito', async () => {
      await productPage.irAlCarrito();
    });

    await test.step('Iniciar la compra', async () => {
      await cartPage.iniciarCompra();
    });

    await test.step('Completar datos y comprar', async () => {
      await checkoutPage.comprar(datosCompra);
    });

    await test.step('Verificar mensaje de Thank you', async () => {
      await checkoutPage.verificarThankYou();
    });
  });
});
