import { expect, test } from './support/test';
import { createAccount } from './support/accounts';
import { seedCardOverThreshold, seedMovements } from './support/movements';

test.describe('resumen del mes', () => {
  test('muestra el mes con sus gráficos, cambia de mes y lleva a los movimientos de una categoría', async ({
    page,
  }) => {
    const account = await createAccount();
    // Hoy: «Almuerzo» S/ 25.90 y «Pan» S/ 4.50 en «Comida». El mes anterior: «Mercado» S/ 120.00.
    await seedMovements(account);
    await page.goto('/');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/');

    const soles = page.getByRole('region', { name: 'Soles' });
    await expect(page.getByLabel('Resumen en soles')).toContainText('GastosS/ 30.40');
    await expect(soles).toContainText('S/ 30.40 gastados en');
    const legend = soles.getByRole('list', { name: 'Gasto por categoría' });
    await expect(legend).toContainText('Comida100.00 %S/ 30.40');
    // Los dos gráficos se dibujan en el navegador; el fixture falla si la CSP bloqueó algo.
    await expect(soles.locator('.recharts-bar-rectangle').first()).toBeVisible();
    await expect(soles.locator('.recharts-pie-sector').first()).toBeVisible();

    await page.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(page).toHaveURL(/\/\?month=\d{4}-\d{2}$/u);
    await expect(page.getByLabel('Resumen en soles')).toContainText('GastosS/ 120.00');

    await legend.getByRole('link', { name: /Comida/u }).click();
    await expect(page).toHaveURL(/\/transactions\?month=\d{4}-\d{2}&categoryId=/u);
    await expect(page.getByRole('region').getByText('Mercado', { exact: true })).toBeVisible();
  });

  test('avisa en el resumen qué tarjeta necesita atención, con el motivo en texto', async ({
    page,
  }) => {
    const account = await createAccount();
    const cardId = await seedCardOverThreshold(account);
    await page.goto('/');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/');

    const cards = page.getByRole('region', { name: 'Tarjetas' });
    await expect(cards).toContainText('Usas el 50.00 % de la línea');
    await expect(cards.getByRole('link', { name: 'Visa BCP •••• 4321' })).toHaveAttribute(
      'href',
      `/credit-cards#tarjeta-${cardId}`,
    );
  });
});
