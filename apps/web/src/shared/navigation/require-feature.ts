import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { isFeatureEnabled } from './feature-flags';

/**
 * Para una página de un módulo: con su flag apagado no existe (404), igual que sus rutas en la
 * API. El flag se lee **al recibir la petición**, no al construir: la imagen publicada se
 * construye una vez y recibe los flags al arrancar.
 */
export async function requireFeature(flag: string): Promise<void> {
  await connection();
  if (!isFeatureEnabled(flag)) notFound();
}
