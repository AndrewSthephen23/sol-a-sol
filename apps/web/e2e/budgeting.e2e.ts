import { expect, test } from './support/test';
import { formatMonth, shiftMonth } from '../src/shared/time/dates';
import { createAccount } from './support/accounts';
import { limaDates, seedMovements } from './support/movements';

test.describe('presupuesto', () => {
  test('se arma, se compara con lo gastado y se copia al mes siguiente', async ({ page }) => {
    const account = await createAccount();
    // Hoy: «Almuerzo» S/ 25.90 y «Pan» S/ 4.50 en «Comida», S/ 30.40 en total.
    await seedMovements(account);
    await page.goto('/budgeting');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/budgeting');

    const thisMonth = limaDates().today.slice(0, 7);
    const spending = page.getByRole('region', { name: 'Gasto variable · Soles' });
    // Sin partidas, lo gastado igual se ve: va en «Sin presupuesto».
    await expect(spending).toContainText('Sin presupuestoS/ 30.40');
    await page.getByRole('button', { name: 'Armar presupuesto' }).click();
    await page.getByLabel('Categoría de la partida nueva').selectOption({ label: 'Comida' });
    await page.getByRole('button', { name: 'Agregar' }).click();
    await page.getByLabel('Comida (S/)').fill('50');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(spending).toContainText('S/ 30.40 de S/ 50.00');
    await expect(spending).toContainText('Quedan S/ 19.60');
    await expect(spending).toContainText('60.80 %');

    // Un gasto nuevo se come lo disponible, y la partida queda excedida.
    await page.getByRole('link', { name: 'Transacciones' }).click();
    await page.getByRole('link', { name: '+ Registrar' }).click();
    await page.getByLabel('Monto').fill('25');
    await page.getByLabel('Categoría').selectOption({ label: 'Comida' });
    await page.getByLabel('Método de pago').selectOption({ label: 'BCP Sueldo' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL('/transactions');
    await page.getByRole('link', { name: 'Presupuesto' }).click();
    await expect(spending).toContainText('S/ 55.40 de S/ 50.00');
    await expect(spending).toContainText('Te pasaste S/ 5.40');
    await expect(spending).toContainText('110.80 %');

    await page.getByRole('button', { name: 'Mes siguiente' }).click();
    const nextMonth = shiftMonth(thisMonth, 1);
    await expect(page).toHaveURL(`/budgeting?month=${nextMonth}`);
    await expect(
      page.getByText(`No hay presupuesto para ${formatMonth(nextMonth)}.`),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Copiar del mes anterior' }).click();
    await expect(page.getByText(`Se copió de ${formatMonth(thisMonth)}.`)).toBeVisible();
    await expect(spending).toContainText('S/ 0.00 de S/ 50.00');
    await expect(spending).toContainText('Quedan S/ 50.00');
  });
});
