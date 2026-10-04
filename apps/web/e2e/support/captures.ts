import { createApiClient } from '../../src/shared/api/client';
import type { Account } from './accounts';
import { API_URL } from './environment';

const api = createApiClient({ baseUrl: API_URL });

/**
 * Lo que haría el atajo del teléfono: con la cuenta crea un token personal y, con él, manda una
 * captura a `POST /captures`, que se queda en la bandeja.
 */
export async function sendCapture(
  { email, password }: Account,
  capture: { amountText: string; merchant: string },
): Promise<void> {
  const login = await api.POST('/api/v1/auth/login', { body: { email, password } });
  if (!login.data) throw new Error(`Login answered ${String(login.response.status)}.`);

  const token = await api.POST('/api/v1/tokens', {
    headers: { Authorization: `Bearer ${login.data.accessToken}` },
    body: { name: 'iPhone', scopes: ['captures:write'] },
  });
  if (!token.data) throw new Error(`Token answered ${String(token.response.status)}.`);

  const sent = await api.POST('/api/v1/captures', {
    headers: { Authorization: `Bearer ${token.data.token}` },
    body: { source: 'IOS_SHORTCUT', occurredAt: new Date().toISOString(), ...capture },
  });
  if (sent.response.status !== 201) {
    throw new Error(`Capture answered ${String(sent.response.status)}.`);
  }
}
