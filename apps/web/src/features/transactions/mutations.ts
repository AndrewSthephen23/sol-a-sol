'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { problemCode } from '@/shared/api/problem';
import { useApi } from '@/shared/session/session-provider';

import type { TransactionBody, TransferBody } from './movement-form-model';
import { ApiRequestError, queryKeys } from './queries';

export type MovementKind = 'transaction' | 'transfer';

/**
 * Lo que respondió la API a un cambio. No se lanza en un rechazo: el formulario necesita el
 * código para poner el error junto a su campo.
 */
export type Outcome = { ok: true } | { ok: false; status: number; code: string | null };

function outcomeOf(problem: unknown, response: Response): Outcome {
  return response.ok
    ? { ok: true }
    : { ok: false, status: response.status, code: problemCode(problem) };
}

/** Tras cualquier cambio, la lista, sus totales y las etiquetas se vuelven a pedir. */
function useInvalidateMovements() {
  const client = useQueryClient();

  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.allMovements }),
      client.invalidateQueries({ queryKey: queryKeys.tags }),
    ]);
}

export function useSaveTransaction(id: string | null) {
  const api = useApi();
  const invalidate = useInvalidateMovements();

  return useMutation({
    mutationFn: async (body: TransactionBody): Promise<Outcome> => {
      const { error, response } =
        id === null
          ? await api.POST('/api/v1/transactions', { body })
          : await api.PATCH('/api/v1/transactions/{id}', { params: { path: { id } }, body });

      return outcomeOf(error, response);
    },
    onSuccess: invalidate,
  });
}

export function useSaveTransfer(id: string | null) {
  const api = useApi();
  const invalidate = useInvalidateMovements();

  return useMutation({
    mutationFn: async (body: TransferBody): Promise<Outcome> => {
      const { error, response } =
        id === null
          ? await api.POST('/api/v1/transfers', { body })
          : await api.PATCH('/api/v1/transfers/{id}', { params: { path: { id } }, body });

      return outcomeOf(error, response);
    },
    onSuccess: invalidate,
  });
}

/** Borra (lógicamente) o restaura un movimiento. Restaurar es el «Deshacer» del aviso. */
export function useDeleteMovement() {
  const api = useApi();
  const invalidate = useInvalidateMovements();

  const remove = useMutation({
    mutationFn: async ({ kind, id }: { kind: MovementKind; id: string }): Promise<Outcome> => {
      const params = { params: { path: { id } } };
      const { error, response } =
        kind === 'transaction'
          ? await api.DELETE('/api/v1/transactions/{id}', params)
          : await api.DELETE('/api/v1/transfers/{id}', params);

      return outcomeOf(error, response);
    },
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: async ({ kind, id }: { kind: MovementKind; id: string }): Promise<Outcome> => {
      const params = { params: { path: { id } } };
      const { error, response } =
        kind === 'transaction'
          ? await api.POST('/api/v1/transactions/{id}/restore', params)
          : await api.POST('/api/v1/transfers/{id}/restore', params);

      return outcomeOf(error, response);
    },
    onSuccess: invalidate,
  });

  return { remove, restore };
}

/** Un movimiento para corregirlo. `null` si no existe (o es de otra cuenta: la API no distingue). */
export function useMovement(kind: MovementKind, id: string) {
  const api = useApi();

  return useQuery({
    queryKey: ['movement', kind, id],
    queryFn: async () => {
      const params = { params: { path: { id } } };
      const { data, response } =
        kind === 'transaction'
          ? await api.GET('/api/v1/transactions/{id}', params)
          : await api.GET('/api/v1/transfers/{id}', params);
      if (response.status === 404) return null;
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
    // Se corrige lo que hay ahora, no lo que había en caché.
    staleTime: 0,
  });
}
