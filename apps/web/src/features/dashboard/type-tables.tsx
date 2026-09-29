import { type Currency, formatMoney } from '@/shared/format/money';
import { type CategoryInfo, TYPE_LABELS } from '@/features/transactions/labels';

import type { CurrencyReport } from './dashboard-model';

interface TypeTablesProps {
  byType: CurrencyReport['byType'];
  currency: Currency;
  categories: ReadonlyMap<string, CategoryInfo>;
}

/** Cada tipo con sus categorías madre, de mayor a menor, y su total. */
export function TypeTables({ byType, currency, categories }: Readonly<TypeTablesProps>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {byType.map((table) => (
        <table
          key={table.type}
          className="w-full overflow-hidden rounded-lg border border-stone-200 bg-white text-sm"
        >
          <caption className="px-1 pb-1 text-left font-semibold text-stone-500">
            {TYPE_LABELS[table.type]}
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Categoría</th>
              <th scope="col">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {table.categories.map((row) => (
              <tr key={row.categoryId}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {categories.get(row.categoryId)?.name ?? 'Categoría'}
                </th>
                <td className="px-3 py-2 text-right">{formatMoney(row.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-stone-200 font-semibold">
            <tr>
              <th scope="row" className="px-3 py-2 text-left">
                Total
              </th>
              <td className="px-3 py-2 text-right">{formatMoney(table.total, currency)}</td>
            </tr>
          </tfoot>
        </table>
      ))}
    </div>
  );
}
