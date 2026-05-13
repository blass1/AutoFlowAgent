import { test } from '../fixtures';
import { dataTestset001 } from '../data';
import LoginPage from '../pages/LoginPage';
import OverviewPage from '../pages/OverviewPage';
import AddToCartMonitorPage from '../pages/AddToCartMonitorPage';
import CartPage from '../pages/CartPage';

test.describe('Testset001 [testSetId:0001]', () => {
  test('Demon compra test [testId:01]', async ({ page }) => {
    const { urlInicial, usuarioPrincipal } = dataTestset001;

    const loginPage = new LoginPage(page);
    const overviewPage = new OverviewPage(page);
    const addToCartMonitorPage = new AddToCartMonitorPage(page);
    const cartPage = new CartPage(page);

    await test.step('Abrir el canal', async () => {
      await page.goto(urlInicial);
    });

    await test.step('Loguearse', async () => {
      await loginPage.ingresar(usuarioPrincipal.user, usuarioPrincipal.pass);
    });

    await test.step('Seleccionar categoría Monitors', async () => {
      await overviewPage.seleccionarMonitores();
    });

    await test.step('Verificar Apple monitor en el listado', async () => {
      await addToCartMonitorPage.verificarAppleMonitorVisible();
    });

    await test.step('Ir al detalle del producto', async () => {
      await addToCartMonitorPage.seleccionarAppleMonitor();
    });

    await test.step('Verificar título del producto', async () => {
      await addToCartMonitorPage.verificarTituloVisible();
    });

    await test.step('Agregar al carrito', async () => {
      await addToCartMonitorPage.agregarAlCarrito();
    });

    await test.step('Ir al carrito', async () => {
      await cartPage.irAlCarrito();
    });

    await test.step('Verificar producto en el carrito', async () => {
      await cartPage.verificarProductoEnCarrito();
    });
  });
});
