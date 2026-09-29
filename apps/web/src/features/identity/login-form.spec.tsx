import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { LoginForm } from './login-form';

type LoginBody = Record<string, string>;

function problem(status: number, code: string, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      type: `urn:sol-a-sol:error:${code}`,
      title: 'Unauthorized',
      status,
      detail: 'English text that must never be shown.',
    }),
    { status, headers: { 'Content-Type': 'application/problem+json', ...headers } },
  );
}

const SIGNED_IN = () =>
  new Response(JSON.stringify({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/** La API de login: `answer` decide la respuesta según el cuerpo recibido. */
function setup(answer: (body: LoginBody) => Response | Promise<Response>) {
  // Solo los cuerpos del login: al montar, el proveedor además intenta recuperar la sesión.
  const bodies: LoginBody[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const request = input as Request;
    if (new URL(request.url).pathname !== '/api/v1/auth/login') {
      return new Response(null, { status: 401 });
    }
    const body = (await request.json()) as LoginBody;
    bodies.push(body);

    return answer(body);
  });
  const session = new Session({ fetch });
  const onSignedIn = vi.fn();
  const user = userEvent.setup();

  render(
    <SessionProvider session={session}>
      <LoginForm onSignedIn={onSignedIn} />
    </SessionProvider>,
  );

  async function signIn(email = 'ana@example.test', password = 'una-clave-larga') {
    if (email) await user.type(screen.getByLabelText('Correo'), email);
    if (password) await user.type(screen.getByLabelText('Contraseña'), password);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  return { bodies, session, onSignedIn, user, signIn };
}

describe('LoginForm', () => {
  it('signs in and hands the access token to the session', async () => {
    const { bodies, session, onSignedIn, signIn } = setup(SIGNED_IN);

    await signIn();

    await waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledOnce();
    });
    expect(bodies).toEqual([{ email: 'ana@example.test', password: 'una-clave-larga' }]);
    expect(session.status).toBe('authenticated');
  });

  it.each([
    ['the email', '', 'una-clave-larga', 'Escribe tu correo.'],
    ['the password', 'ana@example.test', '', 'Escribe tu contraseña.'],
  ])('asks for %s before calling the API', async (_field, email, password, message) => {
    const { bodies, signIn } = setup(SIGNED_IN);

    await signIn(email, password);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(bodies).toEqual([]);
  });

  it('shows a wrong password in Spanish, never the English detail', async () => {
    const { signIn } = setup(() => problem(401, 'invalid-credentials'));

    await signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El correo o la contraseña no son correctos.',
    );
    expect(screen.queryByText(/English text/)).not.toBeInTheDocument();
  });

  it('asks for the second factor when the API requires it, and sends it with the credentials', async () => {
    const { bodies, onSignedIn, user, signIn } = setup((body) =>
      body.totpCode === '123456' ? SIGNED_IN() : problem(401, 'totp-required'),
    );

    await signIn();
    const code = await screen.findByLabelText('Código de tu app autenticadora');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledOnce();
    });
    expect(bodies[1]).toEqual({
      email: 'ana@example.test',
      password: 'una-clave-larga',
      totpCode: '123456',
    });
  });

  it('asks for the code before sending the second step', async () => {
    const { bodies, user, signIn } = setup(() => problem(401, 'totp-required'));

    await signIn();
    await screen.findByLabelText('Código de tu app autenticadora');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el código.');
    expect(bodies).toHaveLength(1);
  });

  it('clears a wrong code and says so', async () => {
    const { user, signIn } = setup((body) =>
      body.totpCode ? problem(401, 'invalid-totp-code') : problem(401, 'totp-required'),
    );

    await signIn();
    const code = await screen.findByLabelText('Código de tu app autenticadora');
    await user.type(code, '000000');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El código no es válido, ya caducó o ya se usó.',
    );
    expect(code).toHaveValue('');
  });

  it('accepts a recovery code instead of the phone, and can go back to it', async () => {
    const { bodies, onSignedIn, user, signIn } = setup((body) =>
      body.recoveryCode ? SIGNED_IN() : problem(401, 'totp-required'),
    );

    await signIn();
    await user.click(await screen.findByRole('button', { name: /usar un código de recuperación/ }));
    await user.click(screen.getByRole('button', { name: /app autenticadora/ }));
    await user.click(screen.getByRole('button', { name: /usar un código de recuperación/ }));
    await user.type(screen.getByLabelText('Código de recuperación'), 'ABCD-EFGH-JKMN');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledOnce();
    });
    expect(bodies[1]).toMatchObject({ recoveryCode: 'ABCD-EFGH-JKMN' });
    expect(bodies[1]).not.toHaveProperty('totpCode');
  });

  it('shows how long to wait after too many attempts, and does not retry by itself', async () => {
    const { bodies, signIn } = setup(() =>
      problem(429, 'too-many-login-attempts', { 'Retry-After': '120' }),
    );

    await signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos. Vuelve a intentarlo en 2 minutos.',
    );
    expect(bodies).toHaveLength(1);
  });

  it('falls back to a generic message for an error it does not know', async () => {
    const { signIn } = setup(() => new Response('Bad Gateway', { status: 502 }));

    await signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal.');
  });

  it('says when it cannot reach the API', async () => {
    const { signIn } = setup(() => Promise.reject(new TypeError('Failed to fetch')));

    await signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar.');
  });

  it('disables the button while the request is on its way', async () => {
    let answer: (response: Response) => void = () => undefined;
    const { signIn } = setup(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );

    await signIn();

    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
    answer(SIGNED_IN());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    });
  });
});
