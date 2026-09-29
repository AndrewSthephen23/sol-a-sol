import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';

const API = 'https://api.example.test';

function respondWith(status: number, body: unknown, contentType = 'application/json') {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } }),
    ),
  );
}

describe('createApiClient', () => {
  it('calls the documented route on the API origin, with its query', async () => {
    const fetch = respondWith(200, { items: [], nextCursor: null });
    const client = createApiClient({ baseUrl: API, fetch });

    await client.GET('/api/v1/transactions', { params: { query: { limit: 20 } } });

    const [request] = fetch.mock.calls[0] ?? [];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).method).toBe('GET');
    expect((request as Request).url).toBe(`${API}/api/v1/transactions?limit=20`);
  });

  it('returns a Problem Details body as the error, not as data', async () => {
    const problem = {
      type: 'urn:sol-a-sol:error:not-found',
      title: 'Not Found',
      status: 404,
      detail: 'Transaction not found.',
    };
    const client = createApiClient({
      baseUrl: API,
      fetch: respondWith(404, problem, 'application/problem+json'),
    });

    const { data, error, response } = await client.GET('/api/v1/transactions/{id}', {
      params: { path: { id: 'f4d1c1a0-0000-4000-8000-000000000000' } },
    });

    expect(data).toBeUndefined();
    expect(error).toEqual(problem);
    expect(response.status).toBe(404);
  });
});
