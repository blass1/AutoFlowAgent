import { test, expect } from '../fixtures';
import LoginPage from '../pages/LoginPage';
import CarritoPage from '../pages/CarritoPage';
import LaptopsPage from '../pages/LaptopsPage';

test('TC-123 Login con celulares}', async ({ page }) => {
  await page.goto('https://www.demoblaze.com/');

  const loginPage = new LoginPage(page);
  const celularesPage = await loginPage.ingresar('admin', 'admin');

  await celularesPage.agregarPrimerCelularAlCarrito();
  await celularesPage.agregarSegundoCelularAlCarrito();

  const carritoPage = new CarritoPage(page);
  await carritoPage.irAlCarrito();
  await carritoPage.verificarProductoEnCarrito('Samsung galaxy s6');
});

test('TC-445333 Login y notebooks', async ({ page }) => {
  await page.goto('https://www.demoblaze.com/');

  const loginPage = new LoginPage(page);
  await loginPage.ingresar('admin', 'admin');

  const laptopsPage = new LaptopsPage(page);
  await laptopsPage.agregarLaptopAlCarrito();

  const carritoPage = new CarritoPage(page);
  await carritoPage.irAlCarrito();
  await carritoPage.verificarProductoEnCarrito('Sony vaio i5');
});
