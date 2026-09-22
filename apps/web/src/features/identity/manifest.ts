import { type FeatureManifest } from '@/shared/navigation/navigation';

/**
 * Todavía **no está en el registro** de navegación: H2 cerró la identidad solo en la API, y
 * `FEATURE_IDENTITY=true` enciende API y menú a la vez. Vuelve al registro cuando exista la
 * pantalla de `/identity`.
 */
export const identityManifest: FeatureManifest = {
  id: 'identity',
  title: 'Identidad',
  route: '/identity',
  icon: 'user',
  flag: 'FEATURE_IDENTITY',
};
