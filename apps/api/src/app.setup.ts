import type { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api/v1';

/**
 * Configuración compartida entre `main.ts` y las pruebas de integración,
 * para que ambas levanten la API exactamente igual.
 */
export function configureApp(app: INestApplication): void {
  // Los health checks quedan fuera del prefijo: los consultan Docker y el balanceador, no los clientes.
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/ready'] });
}
