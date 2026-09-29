'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { problemCode } from '@/shared/api/problem';
import { useApi } from '@/shared/session/session-provider';

import { ApiRequestError } from '@/features/transactions/queries';

import type { BudgetLineBody, BudgetResponse, CopiedBudgetResponse } from './budget-model';

/** `2026-09` → los parámetros de la ruta (`year`, `month`), como texto. */
function pathOf(month: string) {
  const [year = '', monthNumber = ''] = month.split('-');

  return { params: { path: { year, month: String(Number(monthNumber)) } } };
}

export const budgetKey = (month: string) => ['budget', month] as const;

export type SaveOutcome = { ok: true; budget: BudgetResponse } | { ok: false; code: string | null };

export function useBudget(month: string) {
  const api = useApi();

  return useQuery({
    queryKey: budgetKey(month),
    // Lo real cambia con cada movimiento que se registra en otra pantalla, y `transactions` no
    // conoce las claves del presupuesto: al volver aquí se pide de nuevo (mostrando lo guardado
    // mientras tanto).
    staleTime: 0,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/budgets/{year}/{month}', pathOf(month));
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
  });
}

/** Guarda el mes entero; al terminar, la respuesta (con lo real al lado) reemplaza lo que se ve. */
export function useSaveBudget(month: string) {
  const api = useApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (lines: BudgetLineBody[]): Promise<SaveOutcome> => {
      const { data, error } = await api.PUT('/api/v1/budgets/{year}/{month}', {
        ...pathOf(month),
        body: { lines },
      });

      return data === undefined
        ? { ok: false, code: problemCode(error) }
        : { ok: true, budget: data };
    },
    onSuccess: (outcome) => {
      if (outcome.ok) client.setQueryData(budgetKey(month), outcome.budget);
    },
  });
}

export function useCopyBudget(month: string) {
  const api = useApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<CopiedBudgetResponse> => {
      const { data, response } = await api.POST(
        '/api/v1/budgets/{year}/{month}/copy-from-previous',
        pathOf(month),
      );
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
    onSuccess: (copied) => {
      client.setQueryData(budgetKey(month), copied);
    },
  });
}
