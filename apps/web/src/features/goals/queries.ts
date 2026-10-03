'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { problemCode } from '@/shared/api/problem';
import type { Currency } from '@/shared/format/money';
import { useApi } from '@/shared/session/session-provider';

import { ApiRequestError, type Movement } from '@/features/transactions/queries';

import type { ContributionBody, GoalBody, GoalPatch } from './goal-model';

export const goalsKey = ['goals'] as const;
const contributionsKey = (goalId: string) => ['goals', goalId, 'contributions'] as const;

export type SaveOutcome = { ok: true } | { ok: false; code: string | null };

/**
 * Las metas con su progreso. Un aporte enlazado sigue a su transacción, que se corrige en otra
 * pantalla: al volver se pide de nuevo (`staleTime: 0`).
 */
export function useGoals(includeArchived: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: [...goalsKey, { includeArchived }],
    staleTime: 0,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/goals', {
        params: { query: { includeArchived: includeArchived ? 'true' : 'false' } },
      });
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
  });
}

/** Los aportes de una meta, solo cuando se abren (`enabled`). */
export function useGoalContributions(goalId: string, enabled: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: contributionsKey(goalId),
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/goals/{id}/contributions', {
        params: { path: { id: goalId } },
      });
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
  });
}

/** Cualquier cambio mueve el progreso: se vuelven a pedir las metas y sus aportes. */
function useInvalidateGoals() {
  const client = useQueryClient();

  return () => client.invalidateQueries({ queryKey: goalsKey });
}

/** Crea una meta, o corrige o archiva una (`goalId`). */
export function useSaveGoal() {
  const api = useApi();
  const invalidate = useInvalidateGoals();

  return useMutation({
    mutationFn: async (
      input: { body: GoalBody } | { goalId: string; patch: GoalPatch },
    ): Promise<SaveOutcome> => {
      const { error, response } =
        'goalId' in input
          ? await api.PATCH('/api/v1/goals/{id}', {
              params: { path: { id: input.goalId } },
              body: input.patch,
            })
          : await api.POST('/api/v1/goals', { body: input.body });

      return response.ok ? { ok: true } : { ok: false, code: problemCode(error) };
    },
    onSuccess: invalidate,
  });
}

export function useAddContribution() {
  const api = useApi();
  const invalidate = useInvalidateGoals();

  return useMutation({
    mutationFn: async (input: { goalId: string; body: ContributionBody }): Promise<SaveOutcome> => {
      const { error, response } = await api.POST('/api/v1/goals/{id}/contributions', {
        params: { path: { id: input.goalId } },
        body: input.body,
      });

      return response.ok ? { ok: true } : { ok: false, code: problemCode(error) };
    },
    onSuccess: invalidate,
  });
}

export function useRemoveContribution() {
  const api = useApi();
  const invalidate = useInvalidateGoals();

  return useMutation({
    mutationFn: async (input: { goalId: string; contributionId: string }): Promise<SaveOutcome> => {
      const { error, response } = await api.DELETE(
        '/api/v1/goals/{id}/contributions/{contributionId}',
        { params: { path: { id: input.goalId, contributionId: input.contributionId } } },
      );

      return response.ok ? { ok: true } : { ok: false, code: problemCode(error) };
    },
    onSuccess: invalidate,
  });
}

/**
 * Las transacciones de ahorro y de inversión en la moneda de la meta, para enlazar una: las más
 * recientes primero. Solo cuando se elige enlazar (`enabled`).
 */
export function useSavingTransactions(currency: Currency, enabled: boolean): Movement[] {
  const api = useApi();

  return useQueries({
    queries: (['SAVING', 'INVESTMENT'] as const).map((type) => ({
      queryKey: ['movements', 'savings', type, currency],
      enabled,
      staleTime: 0,
      queryFn: async () => {
        const { data, response } = await api.GET('/api/v1/transactions', {
          params: { query: { type, currency, kind: 'transaction' } },
        });
        if (data === undefined) throw new ApiRequestError(response.status);

        return data.items;
      },
    })),
    combine: newestFirst,
  });
}

/** Fuera del componente: una función estable hace que la lista solo cambie con los datos. */
function newestFirst(results: readonly { data?: Movement[] }[]): Movement[] {
  return results
    .flatMap((result) => result.data ?? [])
    .sort((left, right) => right.date.localeCompare(left.date));
}
