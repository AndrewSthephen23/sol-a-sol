'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { useApi } from '@/shared/session/session-provider';

import { ApiRequestError } from '@/features/transactions/queries';

/** `2026-09` → la query de la API: el año y el mes sin cero a la izquierda. */
function yearAndMonth(month: string): { year: string; month: string } {
  const [year = '', monthNumber = ''] = month.split('-');

  return { year, month: String(Number(monthNumber)) };
}

/** El cierre del mes. Cambia con cada movimiento registrado en otra pantalla: se pide al entrar. */
export function useMonthlySummary(month: string) {
  const api = useApi();

  return useQuery({
    queryKey: ['monthly-summary', month],
    staleTime: 0,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/monthly-summary', {
        params: { query: yearAndMonth(month) },
      });
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
  });
}

/** El nombre que propone la API (`Content-Disposition`), o uno armado con el mes. */
function filenameOf(response: Response, month: string): string {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/u.exec(disposition);

  return match?.[1] ?? `resumen-${month}.csv`;
}

/**
 * Descarga el CSV del mes. La API va por el proxy con la sesión en memoria, así que un `<a href>`
 * no llevaría el token: se pide con el cliente, se arma un `Blob` y se baja con un enlace temporal.
 */
export function useDownloadSummaryCsv() {
  const api = useApi();

  return useMutation({
    mutationFn: async (month: string): Promise<void> => {
      const { data, response } = await api.GET('/api/v1/reports/monthly-summary/export', {
        params: { query: { ...yearAndMonth(month), format: 'csv' } },
        parseAs: 'blob',
      });
      if (data === undefined) throw new ApiRequestError(response.status);
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameOf(response, month);
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}

/** El año mes a mes. Cambia con cada movimiento registrado en otra pantalla: se pide al entrar. */
export function useAnnualSummary(year: number) {
  const api = useApi();

  return useQuery({
    queryKey: ['annual-summary', year],
    staleTime: 0,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/annual', {
        params: { query: { year: String(year) } },
      });
      if (data === undefined) throw new ApiRequestError(response.status);

      return data;
    },
  });
}
