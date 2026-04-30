import { expect } from '@playwright/test';
import { test } from '../fixtures/index';
import { usuarios } from '../data';
import Login3Page from '../pages/Login3Page';

// Test set: 333 (ID 12332123)

test('TC-444 Login y historial', async ({ page }) => {
  const login = new Login3Page(page);
  await login.abrirOnlineBanking();
  await login.ingresar(usuarios.qaEstandar.usuario, usuarios.qaEstandar.password);
});
