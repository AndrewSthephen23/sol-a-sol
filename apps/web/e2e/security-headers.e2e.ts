import { expect, test } from './support/test';

test('cada página llega con su política de contenido y las cabeceras de seguridad', async ({
  page,
}) => {
  const first = await page.goto('/login');
  const second = await page.goto('/login');
  const headers = first?.headers() ?? {};
  const policy = headers['content-security-policy'] ?? '';

  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/u);
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain('unsafe');
  // Un nonce nuevo en cada petición.
  expect(second?.headers()['content-security-policy']).not.toBe(policy);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-powered-by']).toBeUndefined();
  // Y aun así la página funciona: el fixture falla si el navegador bloqueó algo.
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
