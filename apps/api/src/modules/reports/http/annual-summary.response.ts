import type { AnnualSummary } from '@sol-a-sol/domain';

/**
 * Lo que viaja: montos como **string decimal**, porcentajes como string sin redondear y un mes que
 * todavía no llega como `null` (no un cero, decisión 16).
 */
export interface AnnualSummaryResponse {
  year: number;
  currencies: {
    currency: string;
    rows: { row: string; months: (string | null)[]; total: string }[];
    savingsRate: string | null;
    distribution: { categoryId: string | null; amount: string; share: string | null }[];
  }[];
}

export function annualSummaryResponse(summary: AnnualSummary): AnnualSummaryResponse {
  return {
    year: summary.year,
    currencies: summary.currencies.map((entry) => ({
      currency: entry.currency,
      rows: entry.rows.map((row) => ({
        row: row.row,
        months: row.months.map((month) => month?.toFixed() ?? null),
        total: row.total.toFixed(),
      })),
      savingsRate: entry.savingsRate?.toString() ?? null,
      distribution: entry.distribution.map((slice) => ({
        categoryId: slice.categoryId,
        amount: slice.amount.toFixed(),
        share: slice.share?.toString() ?? null,
      })),
    })),
  };
}
