import Link from 'next/link';

/** Las dos vistas de «Resumen» (decisión 18 de H6): el cierre del mes y el año mes a mes. */
export function ReportTabs({ current }: Readonly<{ current: 'monthly' | 'annual' }>) {
  const tabs = [
    { id: 'monthly', label: 'Mensual', href: '/reports' },
    { id: 'annual', label: 'Anual', href: '/reports/annual' },
  ] as const;

  return (
    <nav aria-label="Vistas del resumen" className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === current ? 'page' : undefined}
          className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium ${
            tab.id === current ? 'bg-white shadow-sm' : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
