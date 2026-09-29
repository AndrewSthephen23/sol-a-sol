import type { Page } from '@playwright/test';

import { expect, test } from './support/test';
import { createAccount } from './support/accounts';
import { seedMovements } from './support/movements';

/** Un movimiento de la lista, por su fila. */
const row = (page: Page, description: string) =>
  page.getByRole('listitem').filter({ has: page.getByText(description, { exact: true }) });

test('registra un gasto, lo corrige, lo borra y lo recupera', async ({ page }) => {
  const account = await createAccount();
  await seedMovements(account);
  await page.goto('/transactions');
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Registrar: monto, categoría, método y guardar. La descripción la propone la web.
  await page.getByRole('link', { name: '+ Registrar' }).click();
  await page.getByLabel('Monto').fill('18.5');
  await page.getByLabel('Categoría').selectOption({ label: 'Comida' });
  await page.getByLabel('Método de pago').selectOption({ label: 'BCP Sueldo' });
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page).toHaveURL('/transactions');
  await expect(row(page, 'Comida')).toContainText('-S/ 18.50');

  // El método de pago queda recordado para el siguiente registro.
  await page.getByRole('link', { name: '+ Registrar' }).click();
  await expect(page.getByLabel('Método de pago')).toHaveValue(/.+/);
  await page.goBack();

  // Corregir desde la lista.
  await row(page, 'Comida').getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Corregir movimiento' })).toBeVisible();
  await page.getByLabel('Monto').fill('20');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(row(page, 'Comida')).toContainText('-S/ 20.00');

  // Borrar sin confirmación, pero con «Deshacer» unos segundos.
  await page.getByRole('button', { name: 'Borrar «Comida»' }).click();
  await expect(page.getByText('Movimiento borrado.')).toBeVisible();
  await expect(row(page, 'Comida')).toBeHidden();

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByText('Listo, se deshizo.')).toBeVisible();
  await expect(row(page, 'Comida')).toContainText('-S/ 20.00');
});

test('registra una transferencia entre cuentas propias', async ({ page }) => {
  const account = await createAccount();
  await seedMovements(account);
  await page.goto('/transactions/new');
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Se toca la etiqueta visible, como lo haría una persona: el radio está oculto a la vista.
  await page.locator('label').filter({ hasText: 'Transferencia' }).click();
  await expect(page.getByRole('radio', { name: 'Transferencia' })).toBeChecked();
  await page.getByLabel('Monto').fill('50');
  await page.getByLabel('Desde').selectOption({ label: 'BCP Sueldo' });
  await page.getByLabel('Hacia').selectOption({ label: 'Efectivo' });
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(page).toHaveURL('/transactions');
  await expect(row(page, 'Transferencia BCP Sueldo → Efectivo')).toContainText('S/ 50.00');
});
