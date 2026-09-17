/**
 * Ficha de navegación de una funcionalidad. Cada carpeta de `src/features/` exporta la suya,
 * así que agregar un módulo nuevo no obliga a editar el layout.
 */
export interface FeatureManifest {
  id: string;
  title: string;
  route: string;
  icon: string;
  /** Variable de entorno que lo activa (`FEATURE_BUDGETING`). Sin flag, siempre visible. */
  flag?: string;
}

/** Deja las funcionalidades visibles, en el orden en que están declaradas en el registro. */
export function buildNavigation(
  manifests: readonly FeatureManifest[],
  isEnabled: (flag: string) => boolean,
): FeatureManifest[] {
  return manifests.filter((manifest) => manifest.flag === undefined || isEnabled(manifest.flag));
}
