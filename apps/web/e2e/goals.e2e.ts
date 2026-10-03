import { today } from '@sol-a-sol/domain';

import { systemClock } from '../src/shared/time/dates';
import { createAccount } from './support/accounts';
import { expect, test } from './support/test';

test.describe('metas', () => {
  test('se crea una meta, se le aporta dos veces y sube el avance', async ({ page }) => {
    const account = await createAccount();
    const inAYear = today(systemClock).plusMonths(12).toString();
    await page.goto('/goals');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/goals');
    await expect(page.getByText(/Todavía no tienes metas/u)).toBeVisible();

    await page.getByRole('button', { name: 'Nueva meta' }).click();
    const form = page.getByRole('region', { name: 'Nueva meta' });
    await form.getByLabel('Nombre').fill('Viaje a Cusco');
    await form.getByLabel('Moneda').selectOption('PEN');
    await form.getByLabel('Cuánto quieres juntar').fill('1,200');
    await form.getByLabel('Hasta').fill(inAYear);
    await form.getByRole('button', { name: 'Guardar' }).click();

    const goal = page.getByRole('article', { name: 'Viaje a Cusco' });
    await expect(goal).toContainText('Llevas S/ 0.00 de S/ 1,200.00 (0.00 %)');
    await expect(goal).toContainText('Te faltan S/ 1,200.00');
    await expect(goal).toContainText('Vas bien');

    await goal.getByRole('button', { name: 'Aportar' }).click();
    await goal.getByLabel('Monto').fill('100');
    await goal.getByRole('button', { name: 'Guardar' }).click();
    await expect(goal).toContainText('Llevas S/ 100.00 de S/ 1,200.00 (8.33 %)');
    await expect(goal).toContainText('Te faltan S/ 1,100.00');

    await goal.getByRole('button', { name: 'Aportar' }).click();
    await goal.getByLabel('Monto').fill('200');
    await goal.getByRole('button', { name: 'Guardar' }).click();
    await expect(goal).toContainText('Llevas S/ 300.00 de S/ 1,200.00 (25.00 %)');
    await expect(goal).toContainText('Te faltan S/ 900.00');

    await goal.getByRole('button', { name: 'Ver aportes' }).click();
    await expect(goal.getByRole('listitem')).toHaveCount(2);
  });
});
