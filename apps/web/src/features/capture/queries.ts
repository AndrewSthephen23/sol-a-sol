'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { problemCode } from '@/shared/api/problem';
import { useApi } from '@/shared/session/session-provider';

import type { Outcome } from '@/features/transactions/mutations';
import { ApiRequestError, queryKeys } from '@/features/transactions/queries';

import type { CapturePatch } from './capture-model';

export const capturesKey = ['captures'] as const;

export type InboxStatus = 'inbox' | 'discarded';

/**
 * La bandeja (o las descartadas), primero la más reciente, de a una página. `staleTime: 0`:
 * llegan capturas del teléfono mientras se mira.
 */
export function useCaptures(status: InboxStatus) {
  const api = useApi();

  return useInfiniteQuery({
    queryKey: [...capturesKey, status],
    staleTime: 0,
    queryFn: async ({ pageParam }) => {
      const { data, response } = await api.GET('/api/v1/captures', {
        params: { query: { status, ...(pageParam === null ? {} : { cursor: pageParam }) } },
      });
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

/** Hasta cuántas se cuentan: con más, el contador dice «99+» (decidido el 2026-10-04). */
const COUNT_LIMIT = 100;

/**
 * Cuántas capturas hay por revisar, para el menú y para «Inicio» (decisión 17). Se cuenta con la
 * misma lista de la bandeja, sin un endpoint aparte: una página de 100 dice si son 99 o más.
 * Cualquier cambio en la bandeja lo vuelve a pedir (comparte la clave `captures`).
 */
export function usePendingCaptureCount() {
  const api = useApi();

  return useQuery({
    queryKey: [...capturesKey, 'pending-count'],
    staleTime: 0,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/captures', {
        params: { query: { status: 'inbox', limit: COUNT_LIMIT } },
      });
      if (data === undefined) throw new ApiRequestError(response.status);

      return { count: data.items.length, more: data.nextCursor !== null };
    },
  });
}

/**
 * Confirmar crea una transacción: también se vuelven a pedir los movimientos. Cualquier cambio
 * vuelve a pedir la bandeja.
 */
function useInvalidate() {
  const client = useQueryClient();

  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: capturesKey }),
      client.invalidateQueries({ queryKey: queryKeys.allMovements }),
    ]);
  };
}

function outcomeOf(response: Response, error: unknown): Outcome {
  return response.ok
    ? { ok: true }
    : { ok: false, status: response.status, code: problemCode(error) };
}

/** Corrige una captura (decisión 10). Ligada a su id, para el formulario de la tarjeta. */
export function useCorrectCapture(id: string) {
  const api = useApi();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (patch: CapturePatch): Promise<Outcome> => {
      const { error, response } = await api.PATCH('/api/v1/captures/{id}', {
        params: { path: { id } },
        body: patch,
      });
      return outcomeOf(response, error);
    },
    onSuccess: invalidate,
  });
}

export function useConfirmCapture() {
  const api = useApi();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (input: { id: string; rememberCategory: boolean }): Promise<Outcome> => {
      const { error, response } = await api.POST('/api/v1/captures/{id}/confirm', {
        params: { path: { id: input.id } },
        body: { rememberCategory: input.rememberCategory },
      });
      return outcomeOf(response, error);
    },
    onSuccess: invalidate,
  });
}

/** «Confirmar las completas» (decisión 10): cada una por su lado. Devuelve cuántas no se pudo. */
export function useConfirmCaptures() {
  const api = useApi();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (ids: readonly string[]): Promise<{ failed: number } | null> => {
      const { data } = await api.POST('/api/v1/captures/confirm', {
        body: { captures: ids.map((id) => ({ id, rememberCategory: false })) },
      });
      return data === undefined ? null : { failed: data.failed.length };
    },
    onSuccess: invalidate,
  });
}

/** Descartar o deshacer el descarte (decisión 11). */
export function useDiscardCapture() {
  const api = useApi();
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: async (input: { id: string; action: 'discard' | 'restore' }): Promise<Outcome> => {
      const { error, response } =
        input.action === 'discard'
          ? await api.POST('/api/v1/captures/{id}/discard', { params: { path: { id: input.id } } })
          : await api.POST('/api/v1/captures/{id}/restore', { params: { path: { id: input.id } } });
      return outcomeOf(response, error);
    },
    onSuccess: invalidate,
  });
}
