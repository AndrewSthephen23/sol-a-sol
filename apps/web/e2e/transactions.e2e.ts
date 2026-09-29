import { expect, type Page, test } from '@playwright/test';

import { formatDay } from '../src/shared/time/dates';
import { createAccount } from './support/accounts';
import { limaDates, seedMovements } from './support/movements';

/** Un movimiento de la lista: dentro de las secciones por día, no en los filtros. */
const movement = (page: Page, text: string) =>
  page.getByRole('region').getByText(text, { exact: true });

async function signIn(page: Page) {
  const account = await createAccount();
  await seedMovements(account);
  await page.goto('/transactions');
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/transactions');
}

test.describe('lista de transacciones', () => {
  test('muestra el mes por día, con sus totales', async ({ page }) => {
    await signIn(page);

    const today = page.getByRole('region', { name: formatDay(limaDates().today) });
    await expect(today.getByText('Almuerzo')).toBeVisible();
    await expect(today.getByText('Pan')).toBeVisible();
    await expect(movement(page, 'Mercado')).toBeHidden();
    await expect(page.getByLabel('Totales en soles')).toContainText('GastosS/ 30.40');
  });

  test('filtra, busca y cambia de mes sin recargar la página', async ({ page }) => {
    await signIn(page);
    await expect(movement(page, 'Almuerzo')).toBeVisible();
    // Si la página se recargara, esta marca desaparecería.
    await page.evaluate(() => {
      (window as unknown as { sameDocument: boolean }).sameDocument = true;
    });

    await page.getByRole('button', { name: '#viaje' }).click();
    await expect(page).toHaveURL('/transactions?tag=viaje');
    await expect(movement(page, 'Pan')).toBeHidden();
    await expect(movement(page, 'Almuerzo')).toBeVisible();

    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await page.getByLabel('Buscar').fill('pan');
    await expect(page).toHaveURL('/transactions?q=pan');
    await expect(movement(page, 'Almuerzo')).toBeHidden();
    await expect(movement(page, 'Pan')).toBeVisible();

    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await page.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(movement(page, 'Mercado')).toBeVisible();
    await expect(movement(page, 'Almuerzo')).toBeHidden();

    // El botón atrás deshace el cambio de mes.
    await page.goBack();
    await expect(movement(page, 'Almuerzo')).toBeVisible();

    expect(
      await page.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument),
    ).toBe(true);
  });
});
