import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createQueryClient, QueryProvider } from '@/shared/api/query-provider';
import { Session } from '@/shared/session/session';
import { SessionProvider } from '@/shared/session/session-provider';

import { PendingCount } from './pending-count';

/** Una API falsa que responde la bandeja con tantas capturas y anota cómo se pidió. */
function setup(count: number, nextCursor: string | null = null, status = 200) {
  const asked: URL[] = [];
  const session = new Session({
    fetch: (input) => {
      if (!(input instanceof Request)) return Promise.resolve(Response.json({ accessToken: 't' }));
      asked.push(new URL(input.url));
      const items = Array.from({ length: count }, (_, index) => ({ id: String(index) }));
      return Promise.resolve(Response.json({ items, nextCursor }, { status }));
    },
  });
  session.signIn('token');
  render(
    <SessionProvider session={session}>
      <QueryProvider client={createQueryClient()}>
        <p>
          Bandeja
          <PendingCount />
        </p>
      </QueryProvider>
    </SessionProvider>,
  );

  return { asked };
}

describe('PendingCount', () => {
  it('counts the captures waiting in the inbox', async () => {
    const { asked } = setup(3);

    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('por revisar')).toHaveClass('sr-only');
    expect(asked[0]?.search).toBe('?status=inbox&limit=100');
  });

  it('says 99+ when there are more', async () => {
    setup(100, 'otra-pagina');

    expect(await screen.findByText('99+')).toBeInTheDocument();
  });

  it('shows nothing without captures waiting, or if the count fails', async () => {
    const { asked } = setup(0);
    await screen.findByText('Bandeja');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(asked).toHaveLength(1);
    expect(screen.queryByText('por revisar')).not.toBeInTheDocument();
  });
});
