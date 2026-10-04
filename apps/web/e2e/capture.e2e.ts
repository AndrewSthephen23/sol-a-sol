import { createAccount } from './support/accounts';
import { sendCapture } from './support/captures';
import { expect, test } from './support/test';

test.describe('bandeja', () => {
  test('una captura del teléfono se corrige, se confirma y aparece en movimientos', async ({
    page,
  }) => {
    const account = await createAccount();
    await sendCapture(account, { amountText: 'S/ 18.50', merchant: 'Tambo' });
    await page.goto('/capture');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/capture');

    const card = page.getByRole('article', { name: 'S/ 18.50 Tambo' });
    await expect(card).toContainText('Falta la categoría.');
    await expect(card.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

    await card.getByRole('button', { name: 'Corregir' }).click();
    await card.getByLabel('Categoría').selectOption({ label: 'Comida' });
    await card.getByRole('button', { name: 'Guardar' }).click();
    await card.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('No hay nada por revisar.')).toBeVisible();

    await page.goto('/transactions');
    await expect(page.getByRole('region').getByText('Tambo', { exact: true })).toBeVisible();
  });

  test('una captura descartada se recupera con «Deshacer»', async ({ page }) => {
    const account = await createAccount();
    await sendCapture(account, { amountText: 'S/ 7.00', merchant: 'Wong' });
    await page.goto('/capture');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    const card = page.getByRole('article', { name: 'S/ 7.00 Wong' });
    await card.getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByText('No hay nada por revisar.')).toBeVisible();
    await page.getByRole('button', { name: 'Deshacer' }).click();

    await expect(card).toBeVisible();
  });

  test('Inicio y el menú avisan cuántas capturas esperan, y llevan a la bandeja', async ({
    page,
  }) => {
    const account = await createAccount();
    await sendCapture(account, { amountText: 'S/ 12.00', merchant: 'Plaza Vea' });
    await page.goto('/');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/Tienes 1 captura por revisar/u)).toBeVisible();
    // «Bandeja» queda a la vista también en el teléfono, fuera del menú plegado.
    const inbox = page
      .getByRole('navigation', { name: 'Secciones' })
      .getByRole('link', { name: 'Bandeja 1 por revisar' });
    await expect(inbox).toBeVisible();

    await inbox.click();
    await expect(page).toHaveURL('/capture');
    await expect(page.getByRole('article', { name: 'S/ 12.00 Plaza Vea' })).toBeVisible();
  });
});
