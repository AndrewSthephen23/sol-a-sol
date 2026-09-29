import { expect, test } from '@playwright/test';

import { createAccount } from './support/accounts';
import { limaDates, seedMovements } from './support/movements';

/**
 * Un CSV inventado con la forma del formato oficial: los datos reales del autor nunca van a
 * pruebas. Trae una categoría y un método de pago que la cuenta no tiene.
 */
function csv(): string {
  const { today } = limaDates();

  return [
    'fecha,tipo,categoria,subcategoria,monto,moneda,descripcion,metodo_pago,comercio,destino,monto_destino,etiquetas',
    `${today},Gasto variable,Jardinería,,45.00,PEN,Semillas,BCP Sueldo,,,,`,
    `${today},Gasto variable,Comida,,12.50,PEN,Menú,Visa Oro,,,,oficina`,
    `${today},Transferencia,,,100.00,PEN,A efectivo,BCP Sueldo,,Efectivo,,`,
  ].join('\n');
}

test('importa un CSV revisando la vista previa y decidiendo lo que falta', async ({ page }) => {
  const account = await createAccount();
  await seedMovements(account);
  await page.goto('/transactions/import');
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByLabel('Elige el archivo').setInputFiles({
    name: 'movimientos.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv()),
  });

  const preview = page.getByRole('region', { name: 'Vista previa de «movimientos.csv»' });
  await expect(preview).toContainText('3 filas leídas: 2 transacciones y 1 transferencia.');
  await expect(preview).toContainText('Etiquetas nuevas: oficina.');

  // «Jardinería» se crea (lo propuesto); «Visa Oro» se crea como tarjeta, con sus últimos 4.
  await expect(page.getByRole('group', { name: /Jardinería — 1 fila, no existe/ })).toBeVisible();
  await page.getByLabel('Tipo de «Visa Oro»').selectOption('CREDIT_CARD');
  await page.getByLabel('Moneda de «Visa Oro»').selectOption('BOTH');
  await page.getByLabel('Últimos 4 dígitos de «Visa Oro»').fill('4321');
  await page.getByRole('button', { name: 'Importar 3 movimientos' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Se importaron 3 movimientos: 2 transacciones y 1 transferencia.',
  );
  await page.getByRole('link', { name: 'Ver transacciones' }).click();

  const list = page.getByRole('region');
  await expect(list.getByText('Semillas', { exact: true })).toBeVisible();
  await expect(list.getByText('Jardinería · BCP Sueldo', { exact: true })).toBeVisible();
  await expect(list.getByText('Comida · Visa Oro ···· 4321', { exact: true })).toBeVisible();
  await expect(list.getByText('A efectivo', { exact: true })).toBeVisible();

  // Volver a importar el mismo archivo no duplica nada.
  await page.goto('/transactions/import');
  await page.getByLabel('Elige el archivo').setInputFiles({
    name: 'movimientos.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv()),
  });
  await expect(page.getByText('3 filas ya se importaron antes y se omitirán.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'No hay nada nuevo que importar' })).toBeDisabled();
});
