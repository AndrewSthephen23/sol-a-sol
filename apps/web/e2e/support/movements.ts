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
