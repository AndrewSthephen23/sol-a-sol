import { type FeatureManifest } from '@/shared/navigation/navigation';

/** Pantalla inicial: siempre visible, no depende de ningún feature flag. */
export const dashboardManifest: FeatureManifest = {
  id: 'dashboard',
  title: 'Resumen',
  route: '/',
  icon: 'home',
};
