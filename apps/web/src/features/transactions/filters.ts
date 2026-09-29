import type { paths } from '@/shared/api/schema.gen';

type ListQuery = NonNullable<paths['/api/v1/transactions']['get']['parameters']['query']>;
export type TransactionType = NonNullable<ListQuery['type']>;

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  'VARIABLE_EXPENSE',
  'FIXED_EXPENSE',
  'INCOME',
  'SAVING',
  'INVESTMENT',
  'DEBT',
];

/** `show`: qué movimientos. Un tipo de transacción, solo transferencias, o todo. */
export type Show = TransactionType | 'TRANSFER' | 'ALL';

export interface Filters {
  /** `YYYY-MM`. Siempre hay uno: la lista es de un mes. */
  month: string;
  show: Show;
  categoryId: string | null;
  tag: string | null;
  q: string | null;
}

const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function isShow(value: string | null): value is Show {
  return (
    value === 'TRANSFER' || value === 'ALL' || TRANSACTION_TYPES.includes(value as TransactionType)
  );
}

function nonBlank(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? null : trimmed;
}

/**
 * Los filtros viven en la URL: filtrar no recarga la página, y un filtro se puede compartir o
 * recuperar con el botón atrás. Lo que no tiene la forma esperada se ignora en vez de mandarlo
 * a la API a que lo rechace.
 */
export function readFilters(params: URLSearchParams, defaultMonth: string): Filters {
  const month = params.get('month');
  const show = params.get('show');
  const categoryId = params.get('categoryId');

  return {
    month: month !== null && MONTH.test(month) ? month : defaultMonth,
    show: isShow(show) ? show : 'ALL',
    // Una transferencia no tiene categoría ni etiquetas: con `TRANSFER` esos filtros sobran.
    categoryId:
      show !== 'TRANSFER' && categoryId !== null && UUID.test(categoryId) ? categoryId : null,
    tag: show === 'TRANSFER' ? null : nonBlank(params.get('tag')),
    q: nonBlank(params.get('q')),
  };
}

/** La query de la página: solo lo que difiere de lo que se ve por defecto. */
export function writeFilters(filters: Filters, defaultMonth: string): string {
  const params = new URLSearchParams();
  if (filters.month !== defaultMonth) params.set('month', filters.month);
  if (filters.show !== 'ALL') params.set('show', filters.show);
  if (filters.categoryId !== null) params.set('categoryId', filters.categoryId);
  if (filters.tag !== null) params.set('tag', filters.tag);
  if (filters.q !== null) params.set('q', filters.q);

  return params.toString();
}

/** La query de la API para esos filtros (sin cursor ni límite). */
export function toListQuery(filters: Filters): ListQuery {
  return {
    month: filters.month,
    ...(filters.show === 'TRANSFER' ? { kind: 'transfer' as const } : {}),
    ...(filters.show !== 'ALL' && filters.show !== 'TRANSFER' ? { type: filters.show } : {}),
    ...(filters.categoryId === null ? {} : { categoryId: filters.categoryId }),
    ...(filters.tag === null ? {} : { tag: filters.tag }),
    ...(filters.q === null ? {} : { q: filters.q }),
  };
}
