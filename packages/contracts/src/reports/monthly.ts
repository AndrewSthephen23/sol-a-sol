import { z } from 'zod';

/**
 * El mes del dashboard (`?year=2026&month=9`): solo la forma. Un mes que no existe (13) lo
 * rechaza el dominio al armar la fecha, diciendo qué regla se rompió.
 */
export const monthlyReportQuerySchema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/u, { message: 'Expected a year such as "2026".' })
    .transform(Number),
  month: z
    .string()
    .regex(/^\d{1,2}$/u, { message: 'Expected a month such as "9".' })
    .transform(Number),
});

export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;

/**
 * Exportar el resumen de un mes: el mismo mes, y el formato. Hoy solo `csv`; el PDF es de una fase
 * posterior y se rechaza en vez de ignorarse.
 */
export const monthlySummaryExportQuerySchema = monthlyReportQuerySchema.extend({
  format: z.enum(['csv']),
});

export type MonthlySummaryExportQuery = z.infer<typeof monthlySummaryExportQuerySchema>;

/** El año del resumen anual (`?year=2026`): solo la forma; el rango lo decide el dominio. */
export const annualReportQuerySchema = monthlyReportQuerySchema.pick({ year: true });

export type AnnualReportQuery = z.infer<typeof annualReportQuerySchema>;
