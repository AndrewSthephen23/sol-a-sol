import type { ReactNode } from 'react';

import { buildNavigation, type FeatureManifest } from './navigation';

interface SidebarProps {
  manifests: readonly FeatureManifest[];
  isEnabled: (flag: string) => boolean;
  /** Lo que va al final de la barra, fuera de la lista de secciones (cerrar sesión). */
  actions?: ReactNode;
}

/**
 * Barra de secciones. Se arma leyendo los manifests, no una lista escrita a mano:
 * un módulo nuevo aparece solo cuando su flag está activo.
 *
 * Usa enlaces normales porque hoy existe una sola ruta; cuando haya varias pantallas
 * conviene pasar a `next/link` para la navegación del lado del cliente.
 */
export function Sidebar({ manifests, isEnabled, actions }: Readonly<SidebarProps>) {
  const items = buildNavigation(manifests, isEnabled);

  return (
    <nav aria-label="Secciones" className="border-b border-stone-200 bg-white">
      {/* Las secciones pasan a otra línea si no caben: en un teléfono nunca desbordan la página. */}
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-4 px-4 py-3 text-sm">
        <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <a className="font-medium text-stone-700 hover:text-amber-600" href={item.route}>
                {item.title}
              </a>
            </li>
          ))}
        </ul>
        {actions !== undefined && <div className="shrink-0">{actions}</div>}
      </div>
    </nav>
  );
}
