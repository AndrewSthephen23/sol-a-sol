import { type FeatureManifest } from '@/shared/navigation/navigation';

/**
 * Pantalla inicial: siempre visible, no depende de ningún feature flag. Se llama «Inicio» desde que
 * «Resumen» es el cierre del mes y del año (`/reports`, 2026-10-03).
 */
export const dashboardManifest: FeatureManifest = {
  id: 'dashboard',
  title: 'Inicio',
  route: '/',
  icon: 'home',
};
