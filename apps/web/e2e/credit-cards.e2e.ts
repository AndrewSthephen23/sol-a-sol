import { expect, test } from './support/test';
import { createAccount } from './support/accounts';
import { buyWithCard, payCard, seedUnconfiguredCard } from './support/movements';

test.describe('tarjetas', () => {
  test('se configura, sube con una compra y baja con el pago', async ({ page }) => {
    const account = await createAccount();
    const fixture = await seedUnconfiguredCard(account);
    await page.goto('/credit-cards');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/credit-cards');

    const card = page.getByRole('article', { name: 'Visa BCP •••• 4321' });
    await card.getByRole('button', { name: 'Configura tu tarjeta' }).click();
    await card.getByLabel('Línea de crédito').fill('1,000');
    await card.getByLabel('Día de corte').fill('20');
    await card.getByLabel('Días después del corte', { exact: true }).fill('25');
    await card.getByRole('button', { name: 'Guardar' }).click();
    await expect(card).toContainText('Debes S/ 0.00');
    await expect(card).toContainText('Usas el 0.00 % de tu línea de S/ 1,000.00');

    await buyWithCard(fixture, '400.00');
    await page.reload();
    await expect(card).toContainText('Debes S/ 400.00 · Consumo del ciclo: S/ 400.00');
    await expect(card).toContainText('Usas el 40.00 % de tu línea de S/ 1,000.00: uso alto');

    await payCard(fixture, '150.00');
    await page.reload();
    await expect(card).toContainText('Debes S/ 250.00');
    await expect(card).toContainText('Usas el 25.00 % de tu línea de S/ 1,000.00');

    // Sus movimientos: la compra y el pago, filtrados por la tarjeta.
    await card.getByRole('link', { name: 'Ver movimientos de la tarjeta' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/transactions\\?paymentMethodId=${fixture.visaId}$`, 'u'),
    );
    const list = page.getByRole('region');
    await expect(list.getByText('Supermercado', { exact: true }).first()).toBeVisible();
    await expect(list.getByText('Pago de la Visa', { exact: true }).first()).toBeVisible();
  });
});
