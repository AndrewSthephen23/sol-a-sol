'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from '@/shared/session/session-provider';

import { ApiRequestError } from '@/features/transactions/queries';

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
