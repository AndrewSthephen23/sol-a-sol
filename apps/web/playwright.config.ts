import { defineConfig, devices } from '@playwright/test';

import { WEB_URL } from './e2e/support/environment';

/**
 * E2E: la web y la API compiladas, contra un PostgreSQL efímero (Testcontainers). Lo levanta
 * todo `e2e/global-setup.ts`; hace falta Docker, igual que para las pruebas de integración.
 *
 * Móvil primero: cada prueba corre en un teléfono y en escritorio.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
