import { expect, test as base } from '@playwright/test';

/**
 * El `test` de todos los E2E: además de lo suyo, **falla si el navegador bloqueó algo por la
 * política de contenido**. Así una CSP que rompe la app se ve en cualquier flujo, no solo en una
 * prueba dedicada.
 */
export const test = base.extend<{ contentSecurityPolicy: undefined }>({
  contentSecurityPolicy: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
          violations.push(message.text());
        }
      });
      await use(undefined);
      expect(violations, 'The page broke its Content Security Policy.').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Va a una sección por el menú. En el teléfono las secciones están plegadas detrás de «Menú»
 * (decidido el 2026-10-04): se abre primero.
 */
export async function openSection(page: import('@playwright/test').Page, name: string) {
  const menu = page.getByRole('button', { name: 'Menú' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name }).click();
}
