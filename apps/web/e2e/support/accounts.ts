import { randomUUID } from 'node:crypto';

import { Secret, TOTP } from 'otpauth';

import { createApiClient } from '../../src/shared/api/client';
import { API_URL, INVITE_CODE_VAR } from './environment';

const api = createApiClient({ baseUrl: API_URL });

export interface Account {
  email: string;
  password: string;
}

export interface AccountWithTotp extends Account {
  /** El código que la app autenticadora mostraría ahora. */
  nextCode: () => string;
}

/** Una cuenta nueva por prueba: así no comparten sesiones ni contadores de intentos. */
export async function createAccount(): Promise<Account> {
  const account = { email: `e2e-${randomUUID()}@example.test`, password: randomUUID() };
  const { response } = await api.POST('/api/v1/auth/register', {
    body: { ...account, inviteCode: process.env[INVITE_CODE_VAR] ?? '' },
  });
  if (response.status !== 201) throw new Error(`Register answered ${String(response.status)}.`);

  return account;
}

/** Una cuenta con el segundo factor ya activo, como si se hubiera escaneado el QR. */
export async function createAccountWithTotp(): Promise<AccountWithTotp> {
  const account = await createAccount();
  const login = await api.POST('/api/v1/auth/login', { body: account });
  if (!login.data) throw new Error(`Login answered ${String(login.response.status)}.`);
  const headers = { Authorization: `Bearer ${login.data.accessToken}` };

  const setup = await api.POST('/api/v1/auth/2fa/setup', { headers });
  if (!setup.data) throw new Error(`2FA setup answered ${String(setup.response.status)}.`);
  const totp = new TOTP({ secret: Secret.fromBase32(setup.data.secret) });

  const verify = await api.POST('/api/v1/auth/2fa/verify', {
    headers,
    body: { code: totp.generate() },
  });
  if (!verify.data) throw new Error(`2FA verify answered ${String(verify.response.status)}.`);

  // Cada código sirve una sola vez y la API acepta un periodo de adelanto: el del siguiente
  // periodo siempre es posterior al que se acaba de gastar al activar.
  return {
    ...account,
    nextCode: () => totp.generate({ timestamp: Date.now() + totp.period * 1000 }),
  };
}
