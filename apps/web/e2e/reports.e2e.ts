import { readFile } from 'node:fs/promises';

import { createAccount } from './support/accounts';
import { limaDates, seedMovements } from './support/movements';
import { expect, test } from './support/test';

test.describe('resumen', () => {
  test('cierra el mes contra el anterior hasta el mismo día y se descarga en CSV', async ({
    page,
  }) => {
    const account = await createAccount();
    // Hoy, S/ 25.90 y S/ 4.50 en Comida; el mismo día del mes anterior, S/ 120.00.
    await seedMovements(account);
    const month = limaDates().today.slice(0, 7);
    await page.goto('/reports');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/reports');

    const soles = page.getByRole('region', { name: 'Soles' });
    await expect(soles).toContainText('Gasto variable: S/ 30.40');
    await expect(soles).toContainText(/S\/ 89\.60 menos que del 1 al \d+ de \p{L}+ \(-74\.67 %\)/u);
    await expect(soles).toContainText('Sin ingresos este mes');
    await expect(soles.getByRole('region', { name: 'En qué gastaste más' })).toContainText(
      'Comida: S/ 30.40 (100.00 % del gasto)',
    );
    await expect(page.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar CSV' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`resumen-${month}.csv`);
    const content = await readFile(await download.path(), 'utf8');
    expect(content.codePointAt(0)).toBe(0xfeff);
    expect(content.slice(1)).toMatch(
      /^Sección;Concepto;Moneda;Monto;Comparado con;Diferencia;Porcentaje\r\n/u,
    );
    expect(content).toContain('Por tipo;Gasto variable;PEN;30.40;120.00;-89.60;-74.67');
  });

  test('se llega desde el inicio con «Ver el cierre del mes»', async ({ page }) => {
    const account = await createAccount();
    await page.goto('/');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();

    await page.getByRole('link', { name: 'Ver el cierre del mes' }).click();

    await expect(page).toHaveURL('/reports');
    await expect(page.getByRole('heading', { name: 'Resumen del mes' })).toBeVisible();
  });
});
