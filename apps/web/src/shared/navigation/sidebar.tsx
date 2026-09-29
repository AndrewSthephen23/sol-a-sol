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
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 text-sm">
        <ul className="flex gap-4">
          {items.map((item) => (
            <li key={item.id}>
              <a className="font-medium text-stone-700 hover:text-amber-600" href={item.route}>
                {item.title}
              </a>
            </li>
          ))}
        </ul>
        {actions}
      </div>
    </nav>
  );
}
