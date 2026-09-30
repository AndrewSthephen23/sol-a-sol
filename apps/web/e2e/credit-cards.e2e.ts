import { expect, test } from './support/test';
import { createAccount } from './support/accounts';
import { buyWithCard, configureCard, payCard, seedUnconfiguredCard } from './support/movements';

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

  test('registra una compra en 3 cuotas viendo el reparto, y la tarjeta muestra lo que falta', async ({
    page,
  }) => {
    const account = await createAccount();
    const fixture = await seedUnconfiguredCard(account);
    await configureCard(fixture);
    await page.goto('/transactions/new');
    await page.getByLabel('Correo').fill(account.email);
    await page.getByLabel('Contraseña').fill(account.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/transactions/new');

    await page.getByLabel('Monto').fill('300');
    await page.getByLabel('Categoría').selectOption({ label: 'Comida' });
    await page.getByLabel('Método de pago').selectOption(fixture.visaId);
    // La Visa es bimoneda: sin moneda no hay reparto que mostrar.
    await page.getByLabel('Moneda').selectOption('PEN');
    await page.getByLabel('En cuotas').check();
    await page.getByLabel('Número de cuotas').fill('3');
    // El reparto se ve antes de guardar, calculado por el dominio.
    await expect(
      page.getByText(/^3 cuotas: 3 de S\/ 100\.00\. La primera va en el estado del/u),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL('/transactions');
    await expect(page.getByText(/de 3 cuotas/u)).toBeVisible();

    await page.goto('/credit-cards');
    const plans = page.getByRole('region', { name: 'Compras en cuotas' });
    await expect(plans).toContainText(/de 3 cuotas facturadas/u);
    await expect(plans).toContainText('Faltan S/');
    await expect(plans).toContainText(/Próxima cuota: S\/ 100\.00 en el estado del/u);
  });
});
