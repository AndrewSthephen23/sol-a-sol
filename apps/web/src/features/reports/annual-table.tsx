import { formatMoney } from '@/shared/format/money';

import {
  type AnnualCurrency,
  cellText,
  MONTH_HEADERS,
  ROW_LABELS,
  TOTAL_ROWS,
} from './annual-model';

/**
 * El año en una tabla fila × mes con su total: la versión en texto de las barras y lo que se lee
 * en el teléfono (se desliza de lado dentro de su caja, sin mover la página).
 */
export function AnnualTable({
  entry,
  caption,
}: Readonly<{ entry: AnnualCurrency; caption: string }>) {
  const { currency } = entry;

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-right text-sm whitespace-nowrap">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-stone-50 text-stone-500">
          <tr>
            <th scope="col" className="sticky left-0 bg-stone-50 px-3 py-2 text-left font-medium">
              Concepto
            </th>
            {MONTH_HEADERS.map((month) => (
              <th key={month} scope="col" className="px-3 py-2 font-medium">
                {month}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 font-semibold text-stone-700">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {entry.rows.map((row) => {
            const strong = TOTAL_ROWS.has(row.row);

            return (
              <tr key={row.row} className={strong ? 'font-semibold' : undefined}>
                <th scope="row" className="sticky left-0 bg-white px-3 py-2 text-left font-medium">
                  {ROW_LABELS[row.row]}
                </th>
                {row.months.map((amount, index) => (
                  <td
                    key={MONTH_HEADERS[index]}
                    className={`px-3 py-2 ${amount?.startsWith('-') ? 'text-red-700' : ''}`}
                  >
                    {cellText(amount, currency)}
                  </td>
                ))}
                <td
                  className={`px-3 py-2 font-semibold ${row.total.startsWith('-') ? 'text-red-700' : ''}`}
                >
                  {formatMoney(row.total, currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
