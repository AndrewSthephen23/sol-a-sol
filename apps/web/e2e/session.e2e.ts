import { randomUUID } from 'node:crypto';

import type { Page } from '@playwright/test';

import { expect, test } from './support/test';
import { type Account, createAccount, createAccountWithTotp } from './support/accounts';

async function signIn(page: Page, { email, password }: Account) {
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

const loggedIn = (page: Page) => page.getByRole('button', { name: 'Cerrar sesión' });

test.describe('sesión', () => {
  test('entra, recarga y sigue dentro', async ({ page }) => {
    const account = await createAccount();
    await page.goto('/login');

    await signIn(page, account);
    await expect(page).toHaveURL('/');
    await expect(loggedIn(page)).toBeVisible();

    // El token de acceso vivía en memoria: al recargar se recupera con la cookie de refresco.
    await page.reload();
    await expect(loggedIn(page)).toBeVisible();
    await expect(page).toHaveURL('/');
  });

  test('una pantalla privada sin sesión lleva al login, y al entrar vuelve a ella', async ({
    page,
  }) => {
    const account = await createAccount();

    await page.goto('/?desde=enlace');
    await expect(page).toHaveURL('/login?next=%2F%3Fdesde%3Denlace');
    await expect(page.getByRole('heading', { name: 'Entrar a Sol a Sol' })).toBeVisible();

    await signIn(page, account);
    await expect(page).toHaveURL('/?desde=enlace');
    await expect(loggedIn(page)).toBeVisible();
  });

  test('al cerrar sesión no se puede volver con el botón atrás', async ({ page }) => {
    const account = await createAccount();
    await page.goto('/login');
    await signIn(page, account);
    await expect(loggedIn(page)).toBeVisible();
    // Una entrada privada en el historial, para que el botón atrás tenga a dónde volver.
    await page.goto('/?pantalla=2');
    await expect(loggedIn(page)).toBeVisible();

    // El login recuerda dónde se estaba: al volver a entrar se sigue ahí.
    await loggedIn(page).click();
    await expect(page).toHaveURL('/login?next=%2F%3Fpantalla%3D2');

    // Atrás vuelve a `/`, que es privada: el guardia la cambia por el login sin mostrarla.
    await page.goBack();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'Entrar a Sol a Sol' })).toBeVisible();
    await expect(loggedIn(page)).toBeHidden();

    // Tampoco recargando: la cookie de refresco se borró.
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('pide el segundo factor cuando la cuenta lo tiene', async ({ page }) => {
    const account = await createAccountWithTotp();
    await page.goto('/login');

    await signIn(page, account);
    await page.getByLabel('Código de tu app autenticadora').fill(account.nextCode());
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(loggedIn(page)).toBeVisible();
  });

  test('una contraseña equivocada se explica en español', async ({ page }) => {
    const account = await createAccount();
    await page.goto('/login');

    await signIn(page, { ...account, password: randomUUID() });

    // Por texto: Next también pone en la página un `role="alert"`, vacío, para anunciar las rutas.
    await expect(
      page.getByRole('alert').filter({ hasText: 'El correo o la contraseña no son correctos.' }),
    ).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});
