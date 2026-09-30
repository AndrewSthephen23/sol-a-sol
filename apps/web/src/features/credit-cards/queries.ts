'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { problemCode } from '@/shared/api/problem';
import { useApi } from '@/shared/session/session-provider';

import { ApiRequestError } from '@/features/transactions/queries';

import type { CardBody } from './card-model';
import { badgeText, type InstallmentPlan, type InstallmentPlanBody } from './installment-model';

export const cardStatusesKey = ['credit-cards', 'status'] as const;

/**
 * Dónde está cada tarjeta hoy. Cambia con cada compra o pago: al volver se pide de nuevo. Con
 * `enabled` en falso (el flag de tarjetas apagado) no se pide nada.
 */
export function useCardStatuses(enabled = true) {
  const api = useApi();

  return useQuery({
    queryKey: cardStatusesKey,
    enabled,
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

export const installmentPlansKey = (cardId: string) =>
  ['credit-cards', cardId, 'installments'] as const;

async function fetchPlans(api: ReturnType<typeof useApi>, cardId: string) {
  const { data, response } = await api.GET('/api/v1/credit-cards/{id}/installments', {
    params: { path: { id: cardId } },
  });
  if (data === undefined) throw new ApiRequestError(response.status);

  return data;
}

/** Las compras en cuotas de una tarjeta; nada si no hay tarjeta. Siguen a su compra: se piden al entrar. */
export function useInstallmentPlans(cardId: string | null) {
  const api = useApi();

  return useQuery({
    queryKey: installmentPlansKey(cardId ?? ''),
    enabled: cardId !== null,
    staleTime: 0,
    queryFn: () => fetchPlans(api, cardId ?? ''),
  });
}

/** Tras marcar o deshacer cuotas cambian los planes, el estado de la tarjeta y la lista. */
function useInvalidateCards() {
  const client = useQueryClient();

  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['credit-cards'] }),
      client.invalidateQueries({ queryKey: ['movements'] }),
    ]);
}

export function useCreateInstallmentPlan() {
  const api = useApi();
  const invalidate = useInvalidateCards();

  return useMutation({
    mutationFn: async (input: {
      cardId: string;
      transactionId: string;
      body: InstallmentPlanBody;
    }): Promise<CardSaveOutcome> => {
      const { error, response } = await api.POST('/api/v1/credit-cards/{id}/installments', {
        params: { path: { id: input.cardId } },
        body: { ...input.body, transactionId: input.transactionId },
      });

      return response.ok ? { ok: true } : { ok: false, code: problemCode(error) };
    },
    onSuccess: invalidate,
  });
}

export function useDeleteInstallmentPlan() {
  const api = useApi();
  const invalidate = useInvalidateCards();

  return useMutation({
    mutationFn: async (input: { cardId: string; planId: string }): Promise<boolean> => {
      const { response } = await api.DELETE('/api/v1/credit-cards/{id}/installments/{planId}', {
        params: { path: { id: input.cardId, planId: input.planId } },
      });

      return response.ok;
    },
    onSuccess: invalidate,
  });
}

/**
 * «3 de 6 cuotas» por transacción, para la lista de movimientos: los planes de todas las tarjetas.
 * Con el flag de tarjetas apagado (`enabled` en falso) no se pide nada y el mapa queda vacío.
 */
export function useInstallmentBadges(enabled: boolean): ReadonlyMap<string, string> {
  const api = useApi();
  const cards = useCardStatuses(enabled);

  return useQueries({
    queries: (enabled ? (cards.data ?? []) : []).map((card) => ({
      queryKey: installmentPlansKey(card.id),
      staleTime: 0,
      queryFn: () => fetchPlans(api, card.id),
    })),
    combine: badgesOf,
  });
}

/** Fuera del componente: una función estable hace que el mapa solo cambie cuando cambian los datos. */
function badgesOf(results: readonly { data?: InstallmentPlan[] }[]): ReadonlyMap<string, string> {
  const badges = new Map<string, string>();
  for (const plan of results.flatMap((result) => result.data ?? [])) {
    const text = badgeText(plan);
    if (text !== null) badges.set(plan.transactionId, text);
  }

  return badges;
}
