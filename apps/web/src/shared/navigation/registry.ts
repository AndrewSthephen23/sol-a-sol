import { dashboardManifest } from '@/features/dashboard/manifest';
import { transactionsManifest } from '@/features/transactions/manifest';
import { budgetingManifest } from '@/features/budgeting/manifest';
import { creditCardsManifest } from '@/features/credit-cards/manifest';
import { goalsManifest } from '@/features/goals/manifest';

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
 *
 * **`reports` tampoco:** su flag enciende los datos del dashboard, pero el dashboard vive en `/`
 * (manifest `dashboard`, decisión 10 de H4). Un enlace a `/reports` apuntaría a nada.
 */
export const featureManifests: readonly FeatureManifest[] = [
  dashboardManifest,
  transactionsManifest,
  budgetingManifest,
  creditCardsManifest,
  goalsManifest,
];
