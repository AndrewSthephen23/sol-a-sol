import { dashboardManifest } from '@/features/dashboard/manifest';
import { catalogManifest } from '@/features/catalog/manifest';
import { transactionsManifest } from '@/features/transactions/manifest';

import { type FeatureManifest } from './navigation';

/**
 * Registro de funcionalidades, en el orden en que aparecen en la navegación.
 * Al agregar un módulo se suma aquí su manifest (`pnpm gen:module` lo hará automáticamente).
 *
 * **`identity` no está**, a propósito: H2 lo cerró solo en la API, y `FEATURE_IDENTITY=true`
 * enciende las dos cosas. Su manifest sigue en `features/identity/` y vuelve aquí en cuanto
 * exista la pantalla de `/identity`; ponerlo antes dejaría un enlace del menú apuntando a nada.
 */
export const featureManifests: readonly FeatureManifest[] = [
  dashboardManifest,
  catalogManifest,
  transactionsManifest,
];
