import { expect } from '@playwright/test';
import { test } from '../fixtures/index';
import { usuarios } from '../data';
import LoginPage from '../pages/LoginPage';
import CuentasPage from '../pages/CuentasPage';
import Login2Page from '../pages/Login2Page';
import ProductosPage from '../pages/ProductosPage';
import Login3Page from '../pages/Login3Page';
import SegurosPage from '../pages/SegurosPage';

test('TC-1234 Login y acceso a cuentas', async ({ page }) => {
  const login = new LoginPage(page);
  await login.abrirOnlineBanking();
  const cuentas = await login.ingresar(usuarios.qaEstandar.usuario, usuarios.qaEstandar.password);
  await cuentas.irACuentas();
  await cuentas.verificarCuentas();
  await cuentas.verificarEncabezado();
});

test('TC-123123 Login y productos', async ({ page }) => {
  const login = new Login2Page(page);
  await login.abrirOnlineBanking();
  const productos = await login.ingresar(usuarios.qaEstandar.usuario, usuarios.qaEstandar.password);
  await productos.irASolicitudDeProductos();
  await productos.verificarProductos();
});

test('TC-1231233 Login y seguros', async ({ page }) => {
  const login = new Login3Page(page);
  await login.abrirOnlineBanking();
  await login.ingresar(usuarios.qaEstandar.usuario, usuarios.qaEstandar.password);
  const seguros = new SegurosPage(page);
  await seguros.irASeguros();
  await seguros.verificarCotizarSeguro();
});
