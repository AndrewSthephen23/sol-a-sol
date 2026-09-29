import { dashboardManifest } from '@/features/dashboard/manifest';
import { transactionsManifest } from '@/features/transactions/manifest';
import { budgetingManifest } from '@/features/budgeting/manifest';

import { type FeatureManifest } from './navigation';

/**
 * Registro de funcionalidades, en el orden en que aparecen en la navegación.
 * Al agregar un módulo se suma aquí su manifest (`pnpm gen:module` lo hará automáticamente).
 *
 * **`identity` no está**, a propósito: H2 lo cerró solo en la API, y `FEATURE_IDENTITY=true`
 * enciende las dos cosas. Su manifest sigue en `features/identity/` y vuelve aquí en cuanto
 * exista la pantalla de `/identity`; ponerlo antes dejaría un enlace del menú apuntando a nada.
 *
 * **`catalog` tampoco**, por lo mismo: su flag hace falta encendido para que la API sirva las
 * categorías y los métodos de pago que usan las transacciones, pero la pantalla de gestión
 * (`/catalog`) quedó para después de H3.
 */
export const featureManifests: readonly FeatureManifest[] = [
  dashboardManifest,
  transactionsManifest,
  budgetingManifest,
];
