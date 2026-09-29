'use client';

import { useEffect, useState } from 'react';

import { MonthNavigator } from '@/shared/time/month-navigator';

import { type Filters, type Show, TRANSACTION_TYPES } from './filters';
import { type CategoryInfo, SHOW_LABELS } from './labels';
import type { Tag } from './queries';

/** Espera tras la última tecla antes de buscar: no una petición por letra. */
export const SEARCH_DEBOUNCE_MS = 300;

const SHOW_OPTIONS: readonly Show[] = ['ALL', ...TRANSACTION_TYPES, 'TRANSFER'];

const FIELD =
  'w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base focus:border-amber-500 focus:outline-none';

interface FilterBarProps {
  filters: Filters;
  categories: readonly CategoryInfo[];
  tags: readonly Tag[];
  onChange: (filters: Filters) => void;
}

export function FilterBar({ filters, categories, tags, onChange }: Readonly<FilterBarProps>) {
  const [search, setSearch] = useState(filters.q ?? '');
  const [appliedQ, setAppliedQ] = useState(filters.q);

  // Si la búsqueda cambió desde fuera (el botón atrás, «Quitar filtros»), el campo la sigue; si
  // no, el retardo de abajo volvería a aplicar lo que quedó escrito.
  if (filters.q !== appliedQ) {
    setAppliedQ(filters.q);
    if ((filters.q ?? '') !== search.trim()) setSearch(filters.q ?? '');
  }

  // La búsqueda se aplica sola cuando se deja de escribir.
  useEffect(() => {
    const q = search.trim() === '' ? null : search.trim();
    if (q === filters.q) return;
    const timer = setTimeout(() => {
      onChange({ ...filters, q });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [search, filters, onChange]);

  const transfers = filters.show === 'TRANSFER';
  // Con un tipo elegido, solo sus categorías; las archivadas se ven porque un mes viejo las usa.
  const offered = categories.filter(
    (category) =>
      filters.show === 'ALL' || filters.show === 'TRANSFER' || category.type === filters.show,
  );
  const filtered =
    filters.show !== 'ALL' ||
    filters.categoryId !== null ||
    filters.tag !== null ||
    filters.q !== null;

  return (
    <div className="flex flex-col gap-3">
      <MonthNavigator
        month={filters.month}
        onChange={(month) => {
          onChange({ ...filters, month });
        }}
      />

      <label className="flex flex-col gap-1 text-sm font-medium">
        <span>Buscar</span>
        <input
          type="search"
          value={search}
          placeholder="Descripción o comercio"
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          className={FIELD}
        />
      </label>

      {/* Plegados: en el teléfono empujarían la lista fuera de la pantalla. Abiertos si hay alguno. */}
      <details open={filters.show !== 'ALL' || filters.categoryId !== null || filters.tag !== null}>
        <summary className="cursor-pointer text-sm font-medium text-stone-700">Filtros</summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            <span>Mostrar</span>
            <select
              value={filters.show}
              onChange={(event) => {
                const show = event.target.value as Show;
                // Una categoría de otro tipo ya no aplica; una transferencia no tiene etiquetas.
                onChange({
                  ...filters,
                  show,
                  categoryId: null,
                  tag: show === 'TRANSFER' ? null : filters.tag,
                });
              }}
              className={FIELD}
            >
              {SHOW_OPTIONS.map((show) => (
                <option key={show} value={show}>
                  {SHOW_LABELS[show]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            <span>Categoría</span>
            <select
              value={filters.categoryId ?? ''}
              disabled={transfers}
              onChange={(event) => {
                onChange({ ...filters, categoryId: event.target.value || null });
              }}
              className={FIELD}
            >
              <option value="">Todas</option>
              {offered.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId === null ? '' : '— '}
                  {category.name}
                  {category.archivedAt === null ? '' : ' (archivada)'}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            <span>Etiqueta</span>
            <select
              value={filters.tag ?? ''}
              disabled={transfers}
              onChange={(event) => {
                onChange({ ...filters, tag: event.target.value || null });
              }}
              className={FIELD}
            >
              <option value="">Todas</option>
              {/* La del filtro puede no estar en la lista si llegó por un enlace. */}
              {filters.tag !== null && !tags.some((tag) => tag.name === filters.tag) && (
                <option value={filters.tag}>{filters.tag}</option>
              )}
              {tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      {filtered && (
        <button
          type="button"
          onClick={() => {
            onChange({ month: filters.month, show: 'ALL', categoryId: null, tag: null, q: null });
          }}
          className="self-start text-sm text-stone-600 underline"
        >
          Quitar filtros
        </button>
      )}
    </div>
  );
}
