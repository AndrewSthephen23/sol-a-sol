import { dashboardManifest } from '@/features/dashboard/manifest';
import { identityManifest } from '@/features/identity/manifest';

import { type FeatureManifest } from './navigation';

/**
 * Registro de funcionalidades, en el orden en que aparecen en la navegación.
 * Al agregar un módulo se suma aquí su manifest (`pnpm gen:module` lo hará automáticamente).
 */
export const featureManifests: readonly FeatureManifest[] = [dashboardManifest, identityManifest];
