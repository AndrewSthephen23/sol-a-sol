'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { paths } from '@/shared/api/schema.gen';
import { useApi } from '@/shared/session/session-provider';

import { type Filters, toListQuery } from './filters';

type ListResponse =
  paths['/api/v1/transactions']['get']['responses'][200]['content']['application/json'];
export type Movement = ListResponse['items'][number];
export type Totals = ListResponse['totals'][number];
export type Category =
  paths['/api/v1/categories']['get']['responses'][200]['content']['application/json'][number];
export type PaymentMethod =
  paths['/api/v1/payment-methods']['get']['responses'][200]['content']['application/json'][number];
export type Tag =
  paths['/api/v1/tags']['get']['responses'][200]['content']['application/json'][number];

/** La respuesta no era la esperada: el mensaje lo arma la pantalla, nunca con el `detail`. */
export class ApiRequestError extends Error {
  constructor(readonly status: number) {
    super(`The API answered ${String(status)}.`);
  }
}

function ensure<T>(data: T | undefined, response: Response): T {
  if (data === undefined) throw new ApiRequestError(response.status);

  return data;
}

export const queryKeys = {
  movements: (filters: Filters) => ['movements', filters] as const,
  allMovements: ['movements'] as const,
  categories: ['categories'] as const,
  paymentMethods: ['payment-methods'] as const,
  tags: ['tags'] as const,
};

/** Los movimientos del mes filtrados, de a una página: `fetchNextPage` trae la siguiente. */
export function useMovements(filters: Filters) {
  const api = useApi();

  return useInfiniteQuery({
    queryKey: queryKeys.movements(filters),
    queryFn: async ({ pageParam }) => {
      const { data, response } = await api.GET('/api/v1/transactions', {
        params: {
          query: { ...toListQuery(filters), ...(pageParam === null ? {} : { cursor: pageParam }) },
        },
      });

      return ensure(data, response);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

/**
 * Todas las categorías, **con las archivadas**: un movimiento viejo puede apuntar a una y tiene
 * que seguir mostrando su nombre. Quien ofrezca categorías para elegir filtra las activas.
 */
export function useCategories() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/categories', {
        params: { query: { includeArchived: 'true' } },
      });

      return ensure(data, response);
    },
    staleTime: 5 * 60_000,
  });
}

/** Todos los métodos de pago, con los archivados, por la misma razón que las categorías. */
export function usePaymentMethods() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.paymentMethods,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/payment-methods', {
        params: { query: { includeArchived: 'true' } },
      });

      return ensure(data, response);
    },
    staleTime: 5 * 60_000,
  });
}

export function useTags() {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/tags');

      return ensure(data, response);
    },
  });
}
