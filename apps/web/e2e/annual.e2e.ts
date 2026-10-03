import { createAccount } from './support/accounts';
import { limaDates, seedYear } from './support/movements';
import { expect, test } from './support/test';

test.describe('resumen anual', () => {
  test('pone cada mes en su columna y dibuja las barras y la dona sin romper la CSP', async ({
    page,
  }) => {
    const account = await createAccount();
    const lastYear = Number(limaDates().today.slice(0, 4)) - 1;
    await seedYear(account, lastYear);
    await page.goto(`/reports/annual?year=${String(lastYear)}`);
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(`/reports/annual?year=${String(lastYear)}`);

    const table = page.getByRole('table', { name: `${String(lastYear)} mes a mes, en soles` });
    const expense = table.getByRole('row', { name: /^Gasto variable/u });
    await expect(expense.getByRole('cell').first()).toHaveText('S/ 100.00');
    await expect(expense.getByRole('cell').nth(11)).toHaveText('S/ 50.00');
    await expect(expense.getByRole('cell').last()).toHaveText('S/ 150.00');
    await expect(
      table
        .getByRole('row', { name: /^Ingresos/u })
        .getByRole('cell')
        .nth(2),
    ).toHaveText('S/ 1,000.00');
    await expect(
      page.getByText(`En ${String(lastYear)} ahorraste el 0.00 % de lo que ganaste`),
    ).toBeVisible();

    // Los gráficos se dibujan en el navegador, y la prueba falla si la CSP bloquea algo.
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
    await expect(page.locator('.recharts-pie-sector').first()).toBeVisible();

    await page.getByRole('link', { name: 'Mensual' }).click();
    await expect(page).toHaveURL('/reports');
    await expect(page.getByRole('heading', { name: 'Resumen del mes' })).toBeVisible();
  });
});
