import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/shared/session/session-provider';

import LoginPage from './page';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), next: '/transactions' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams({ next: navigation.next }),
}));

/** Sin sesión inyectada: la página usa la del navegador, que llama al `fetch` global. */
function stubApi({ hasCookie }: { hasCookie: boolean }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path = input instanceof Request ? new URL(input.url).pathname : String(input);
      if (path.endsWith('/login') || (path.endsWith('/refresh') && hasCookie)) {
        return Promise.resolve(
          Response.json({ accessToken: 'a', tokenType: 'Bearer', expiresIn: 900 }),
        );
      }

      return Promise.resolve(new Response(null, { status: 401 }));
    }),
  );
}

function renderPage() {
  render(
    <SessionProvider>
      <LoginPage />
    </SessionProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.next = '/transactions';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('goes back to where the person wanted to go after signing in', async () => {
    stubApi({ hasCookie: false });
    renderPage();

    await userEvent.type(screen.getByLabelText('Correo'), 'ana@example.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/transactions');
    });
  });

  it('skips the form when the session is still alive', async () => {
    stubApi({ hasCookie: true });
    renderPage();

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/transactions');
    });
  });

  it('never follows a next that leaves the web', async () => {
    navigation.next = 'https://evil.example';
    stubApi({ hasCookie: true });
    renderPage();

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/');
    });
  });
});
