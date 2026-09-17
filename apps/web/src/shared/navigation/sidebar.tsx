import { buildNavigation, type FeatureManifest } from './navigation';

interface SidebarProps {
  manifests: readonly FeatureManifest[];
  isEnabled: (flag: string) => boolean;
}

/**
 * Barra de secciones. Se arma leyendo los manifests, no una lista escrita a mano:
 * un módulo nuevo aparece solo cuando su flag está activo.
 *
 * Usa enlaces normales porque hoy existe una sola ruta; cuando haya varias pantallas
 * conviene pasar a `next/link` para la navegación del lado del cliente.
 */
export function Sidebar({ manifests, isEnabled }: SidebarProps) {
  const items = buildNavigation(manifests, isEnabled);

  return (
    <nav aria-label="Secciones" className="border-b border-stone-200 bg-white">
      <ul className="mx-auto flex max-w-3xl gap-4 px-4 py-3 text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <a className="font-medium text-stone-700 hover:text-amber-600" href={item.route}>
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
