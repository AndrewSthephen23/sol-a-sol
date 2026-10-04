import type { ReactNode } from 'react';

import { buildNavigation, type FeatureManifest } from './navigation';
import { SectionsMenu } from './sections-menu';

interface SidebarProps {
  manifests: readonly FeatureManifest[];
  isEnabled: (flag: string) => boolean;
  /** Lo que va al final de la barra, fuera de la lista de secciones (cerrar sesión). */
  actions?: ReactNode;
}

/**
 * Barra de secciones. Se arma leyendo los manifests, no una lista escrita a mano:
 * un módulo nuevo aparece solo cuando su flag está activo. En el teléfono las secciones van en un
 * menú desplegable, salvo las fijas (`SectionsMenu`).
 */
export function Sidebar({ manifests, isEnabled, actions }: Readonly<SidebarProps>) {
  const items = buildNavigation(manifests, isEnabled).map(
    ({ id, title, route, pinned, counter }) => ({
      id,
      title,
      route,
      pinned: pinned === true,
      ...(counter === undefined ? {} : { counter }),
    }),
  );

  return (
    <nav aria-label="Secciones" className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-4 px-4 py-3 text-sm">
        <SectionsMenu
          items={items.filter((item) => !item.pinned)}
          pinned={items.filter((item) => item.pinned)}
        />
        {actions !== undefined && <div className="shrink-0">{actions}</div>}
      </div>
    </nav>
  );
}
