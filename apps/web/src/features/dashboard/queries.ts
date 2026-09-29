'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from '@/shared/session/session-provider';

import { ApiRequestError } from '@/features/transactions/queries';

export const reportKey = (month: string) => ['report', month] as const;

export function useMonthlyReport(month: string) {
  const api = useApi();

  return useQuery({
    queryKey: reportKey(month),
    // Cambia con cada movimiento que se registra en otra pantalla: al volver se pide de nuevo.
    staleTime: 0,
    queryFn: async () => {
      const [year = '', monthNumber = ''] = month.split('-');
      const { data, response } = await api.GET('/api/v1/reports/monthly', {
        params: { query: { year, month: String(Number(monthNumber)) } },
      });
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
  });
}
