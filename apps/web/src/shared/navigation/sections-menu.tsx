'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface MenuItem {
  id: string;
  title: string;
  route: string;
  counter?: ReactNode;
}

const LINK = 'font-medium text-stone-700 hover:text-amber-600';

function MenuLink({ item }: Readonly<{ item: MenuItem }>) {
  return (
    <a className={LINK} href={item.route}>
      {item.title}
      {item.counter !== undefined && <> {item.counter}</>}
    </a>
  );
}

/**
 * Las secciones del menú. En el teléfono van **plegadas** detrás de «Menú» (decidido el
 * 2026-10-04: con 8 ya no caben); en pantallas anchas, en una fila como siempre. Las fijas
 * (`pinned`) quedan a la vista en las dos, junto al botón.
 */
export function SectionsMenu({
  items,
  pinned,
}: Readonly<{ items: readonly MenuItem[]; pinned: readonly MenuItem[] }>) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="rounded-md border border-stone-300 px-3 py-1 font-medium text-stone-700 md:hidden"
      >
        Menú
      </button>
      {pinned.map((item) => (
        <MenuLink key={item.id} item={item} />
      ))}
      <ul
        id={listId}
        className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-2 md:order-first md:flex md:w-auto md:flex-row md:flex-wrap md:gap-x-4`}
      >
        {items.map((item) => (
          <li key={item.id}>
            <MenuLink item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
