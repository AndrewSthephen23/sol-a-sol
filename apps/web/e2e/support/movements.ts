import { today } from '@sol-a-sol/domain';

import { createApiClient } from '../../src/shared/api/client';
import { systemClock } from '../../src/shared/time/dates';
import type { Account } from './accounts';
import { API_URL } from './environment';

const api = createApiClient({ baseUrl: API_URL });

/** `YYYY-MM-DD` de hoy en Lima, y el mismo día del mes anterior (o el último, si no existe). */
export function limaDates(): { today: string; lastMonth: string } {
  const now = today(systemClock);

  return { today: now.toString(), lastMonth: now.plusMonths(-1).toString() };
}

/**
 * Deja en la cuenta dos métodos de pago (una cuenta y efectivo) y tres gastos: dos de hoy (uno con etiqueta) y uno del mes
 * anterior. Usa la categoría «Comida», que llega con la semilla al registrarse.
 */
export async function seedMovements({ email, password }: Account): Promise<void> {
  const login = await api.POST('/api/v1/auth/login', { body: { email, password } });
  if (!login.data) throw new Error(`Login answered ${String(login.response.status)}.`);
  const headers = { Authorization: `Bearer ${login.data.accessToken}` };

  const categories = await api.GET('/api/v1/categories', { headers });
  const food = categories.data?.find((category) => category.name === 'Comida');
  if (!food) throw new Error('The seeded category «Comida» is missing.');

  const method = await api.POST('/api/v1/payment-methods', {
    headers,
    body: { kind: 'ACCOUNT', alias: 'BCP Sueldo', institution: 'BCP', currency: 'PEN' },
  });
  if (!method.data) throw new Error(`Payment method answered ${String(method.response.status)}.`);
  const cash = await api.POST('/api/v1/payment-methods', {
    headers,
    body: { kind: 'CASH', alias: 'Efectivo', currency: 'PEN' },
  });
  if (!cash.data) throw new Error(`Payment method answered ${String(cash.response.status)}.`);

  const dates = limaDates();
  const expenses = [
    { date: dates.today, description: 'Almuerzo', amount: '25.90', tags: ['viaje'] },
    { date: dates.today, description: 'Pan', amount: '4.50', tags: [] },
    { date: dates.lastMonth, description: 'Mercado', amount: '120.00', tags: [] },
  ];
  for (const expense of expenses) {
    const created = await api.POST('/api/v1/transactions', {
      headers,
      body: { ...expense, type: food.type, categoryId: food.id, paymentMethodId: method.data.id },
    });
    if (!created.data) throw new Error(`Transaction answered ${String(created.response.status)}.`);
  }
}

/**
 * Deja una Visa configurada (línea S/ 1,000.00, corte 20, pago a 25 días) con una compra de hoy de
 * S/ 500.00: usa la mitad de la línea, por encima del 30 %. Devuelve el id de la tarjeta.
 */
export async function seedCardOverThreshold({ email, password }: Account): Promise<string> {
  const login = await api.POST('/api/v1/auth/login', { body: { email, password } });
  if (!login.data) throw new Error(`Login answered ${String(login.response.status)}.`);
  const headers = { Authorization: `Bearer ${login.data.accessToken}` };

  const categories = await api.GET('/api/v1/categories', { headers });
  const food = categories.data?.find((category) => category.name === 'Comida');
  if (!food) throw new Error('The seeded category «Comida» is missing.');

  const visa = await api.POST('/api/v1/payment-methods', {
    headers,
    body: { kind: 'CREDIT_CARD', alias: 'Visa', institution: 'BCP', last4: '4321' },
  });
  if (!visa.data) throw new Error(`Payment method answered ${String(visa.response.status)}.`);
  const card = await api.POST('/api/v1/credit-cards', {
    headers,
    body: {
      paymentMethodId: visa.data.id,
      creditLimit: { amount: '1000.00', currency: 'PEN' },
      statementDay: 20,
      paymentDueRule: { kind: 'DAYS_AFTER_STATEMENT', days: 25 },
    },
  });
  if (!card.data) throw new Error(`Credit card answered ${String(card.response.status)}.`);
  const purchase = await api.POST('/api/v1/transactions', {
    headers,
    body: {
      date: limaDates().today,
      type: food.type,
      categoryId: food.id,
      amount: '500.00',
      currency: 'PEN',
      description: 'Supermercado',
      paymentMethodId: visa.data.id,
    },
  });
  if (!purchase.data) throw new Error(`Transaction answered ${String(purchase.response.status)}.`);

  return card.data.id;
}

/** Lo que hace falta para mover plata con una tarjeta desde la API, sin pasar por la pantalla. */
export interface CardFixture {
  headers: { Authorization: string };
  visaId: string;
  savingsId: string;
  foodId: string;
}

/** Una Visa sin configurar y una cuenta de ahorros en soles, listas para comprar y pagar. */
export async function seedUnconfiguredCard({ email, password }: Account): Promise<CardFixture> {
  const login = await api.POST('/api/v1/auth/login', { body: { email, password } });
  if (!login.data) throw new Error(`Login answered ${String(login.response.status)}.`);
  const headers = { Authorization: `Bearer ${login.data.accessToken}` };

  const categories = await api.GET('/api/v1/categories', { headers });
  const food = categories.data?.find((category) => category.name === 'Comida');
  if (!food) throw new Error('The seeded category «Comida» is missing.');
  const visa = await api.POST('/api/v1/payment-methods', {
    headers,
    body: { kind: 'CREDIT_CARD', alias: 'Visa', institution: 'BCP', last4: '4321' },
  });
  if (!visa.data) throw new Error(`Payment method answered ${String(visa.response.status)}.`);
  const savings = await api.POST('/api/v1/payment-methods', {
    headers,
    body: { kind: 'ACCOUNT', alias: 'Ahorros', institution: 'BCP', currency: 'PEN' },
  });
  if (!savings.data) throw new Error(`Payment method answered ${String(savings.response.status)}.`);

  return { headers, visaId: visa.data.id, savingsId: savings.data.id, foodId: food.id };
}

/** Una compra de hoy con la Visa. */
export async function buyWithCard(fixture: CardFixture, amount: string): Promise<void> {
  const created = await api.POST('/api/v1/transactions', {
    headers: fixture.headers,
    body: {
      date: limaDates().today,
      type: 'VARIABLE_EXPENSE',
      categoryId: fixture.foodId,
      amount,
      currency: 'PEN',
      description: 'Supermercado',
      paymentMethodId: fixture.visaId,
    },
  });
  if (!created.data) throw new Error(`Transaction answered ${String(created.response.status)}.`);
}

/** Paga la Visa desde la cuenta de ahorros, hoy. */
export async function payCard(fixture: CardFixture, amount: string): Promise<void> {
  const created = await api.POST('/api/v1/transfers', {
    headers: fixture.headers,
    body: {
      date: limaDates().today,
      fromPaymentMethodId: fixture.savingsId,
      toPaymentMethodId: fixture.visaId,
      amount,
      description: 'Pago de la Visa',
    },
  });
  if (!created.data) throw new Error(`Transfer answered ${String(created.response.status)}.`);
}
