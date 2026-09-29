import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LogoutButton } from './logout-button';
import { RequireSession } from './require-session';
import { Session } from './session';
import { SessionProvider, useSession } from './session-provider';

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: '/transactions',
  search: 'month=2026-09',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

/** Una API donde `refresh` vale o no según `hasCookie`, y `logout` siempre responde 204. */
function sessionWith({ hasCookie }: { hasCookie: boolean }) {
  const paths: string[] = [];
  const session = new Session({
    fetch: (input) => {
      const path = String(input instanceof Request ? new URL(input.url).pathname : input);
      paths.push(path);
      if (path.endsWith('/refresh') && hasCookie) {
        return Promise.resolve(Response.json({ accessToken: 'restored' }));
      }

      return Promise.resolve(new Response(null, { status: path.endsWith('/logout') ? 204 : 401 }));
    },
  });

  return { session, paths };
}

function renderPrivate(session: Session) {
  render(
    <SessionProvider session={session}>
      <RequireSession>
        <h1>Transacciones</h1>
        <LogoutButton />
      </RequireSession>
    </SessionProvider>,
  );
}

describe('RequireSession', () => {
  beforeEach(() => {
    navigation.replace.mockClear();
  });

  it('shows nothing private while the session is being restored', () => {
    renderPrivate(sessionWith({ hasCookie: true }).session);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando tu sesión…');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows the screen once the refresh cookie restores the session', async () => {
    renderPrivate(sessionWith({ hasCookie: true }).session);

    expect(await screen.findByRole('heading', { name: 'Transacciones' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('sends to the login without a session, remembering where the person wanted to go', async () => {
    renderPrivate(sessionWith({ hasCookie: false }).session);

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        '/login?next=%2Ftransactions%3Fmonth%3D2026-09',
      );
    });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('logs out and then sends to the login, replacing the history entry', async () => {
    const { session, paths } = sessionWith({ hasCookie: true });
    renderPrivate(session);

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledOnce();
    });
    expect(paths).toContain('/api/v1/auth/logout');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('sends to the login when another tab ends the session', async () => {
    const { session } = sessionWith({ hasCookie: true });
    renderPrivate(session);
    await screen.findByRole('heading', { name: 'Transacciones' });

    await act(() => session.logout());

    expect(navigation.replace).toHaveBeenCalledOnce();
  });
});

describe('useSession', () => {
  it('fails loudly outside a SessionProvider', () => {
    function Orphan() {
      useSession();

      return null;
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Orphan />)).toThrow('useSession must be used inside <SessionProvider>.');
  });
});
