'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { problemCode } from '@/shared/api/problem';
import { useApi } from '@/shared/session/session-provider';

import { ApiRequestError } from '@/features/transactions/queries';

import type { CardBody } from './card-model';

export const cardStatusesKey = ['credit-cards', 'status'] as const;

/** Dónde está cada tarjeta hoy. Cambia con cada compra o pago: al volver se pide de nuevo. */
export function useCardStatuses() {
  const api = useApi();

  return useQuery({
    queryKey: cardStatusesKey,
    staleTime: 0,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/credit-cards/status');
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
  });
}

export type CardSaveOutcome = { ok: true } | { ok: false; code: string | null };

/**
 * Configura una tarjeta (`paymentMethodId`) o corrige una configurada (`cardId`). Al terminar se
 * vuelve a pedir el estado: la línea o el corte nuevos cambian todo lo que se ve.
 */
export function useSaveCard() {
  const api = useApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: { body: CardBody } & ({ cardId: string } | { paymentMethodId: string }),
    ): Promise<CardSaveOutcome> => {
      const { error, response } =
        'cardId' in input
          ? await api.PATCH('/api/v1/credit-cards/{id}', {
              params: { path: { id: input.cardId } },
              body: input.body,
            })
          : await api.POST('/api/v1/credit-cards', {
              body: { ...input.body, paymentMethodId: input.paymentMethodId },
            });

      return response.ok ? { ok: true } : { ok: false, code: problemCode(error) };
    },
    onSuccess: async (outcome) => {
      if (outcome.ok) await client.invalidateQueries({ queryKey: cardStatusesKey });
    },
  });
}
