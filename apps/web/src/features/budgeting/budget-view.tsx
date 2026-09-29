import { Money } from '@sol-a-sol/domain';

import { formatMoney } from '@/shared/format/money';
import type { CategoryInfo } from '@/features/transactions/labels';
import { TYPE_LABELS } from '@/features/transactions/labels';

import { barWidth, type BudgetReport, executedText, varianceText } from './budget-model';

const CURRENCY_TITLES = { PEN: 'Soles', USD: 'Dólares' } as const;

/** Lo gastado sin partida, sumado con `Money`: nunca con `number`. */
function unbudgetedTotal(report: BudgetReport): string {
  return report.unbudgeted
    .reduce(
      (total, entry) => total.add(Money.of(entry.amount, report.currency)),
      Money.zero(report.currency),
    )
    .toFixed();
}

/**
 * Lo planeado contra lo real, por tipo y moneda: cada partida con su barra de % ejecutado y una
 * frase que dice qué significa («Quedan…», «Te pasaste…», «Faltan…», «Cumplida»), lo gastado sin
 * partida y el total del tipo. La barra es `<progress>`: nativa, accesible y sin estilos en línea.
 */
export function BudgetView({
  summary,
  categories,
}: Readonly<{ summary: readonly BudgetReport[]; categories: ReadonlyMap<string, CategoryInfo> }>) {
  const nameOf = (id: string) => categories.get(id)?.name ?? 'Categoría';

  return (
    <div className="flex flex-col gap-6">
      {summary.map((report) => {
        const title = `${TYPE_LABELS[report.type]} · ${CURRENCY_TITLES[report.currency]}`;
        const id = `budget-${report.type}-${report.currency}`;

        return (
          <section key={id} aria-labelledby={id} className="flex flex-col gap-2">
            <h2 id={id} className="text-sm font-semibold text-stone-500">
              {title}
            </h2>
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
              {report.lines.map((line) => (
                <li key={line.categoryId} className="flex flex-col gap-1 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">{nameOf(line.categoryId)}</p>
                    <p className="text-sm whitespace-nowrap text-stone-600">
                      {formatMoney(line.actual, report.currency)} de{' '}
                      {formatMoney(line.planned, report.currency)}
                    </p>
                  </div>
                  <progress
                    max={100}
                    value={barWidth(line.executed)}
                    aria-label={`${nameOf(line.categoryId)}: ${executedText(line.executed)} ejecutado`}
                    className={`h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-stone-100 [&::-webkit-progress-value]:rounded-full ${
                      line.status === 'EXCEEDED'
                        ? '[&::-moz-progress-bar]:bg-red-600 [&::-webkit-progress-value]:bg-red-600'
                        : '[&::-moz-progress-bar]:bg-amber-500 [&::-webkit-progress-value]:bg-amber-500'
                    }`}
                  />
                  <p
                    className={`flex justify-between text-sm ${
                      line.status === 'EXCEEDED' ? 'font-medium text-red-700' : 'text-stone-600'
                    }`}
                  >
                    <span>{varianceText(line, report.currency)}</span>
                    <span>{executedText(line.executed)}</span>
                  </p>
                </li>
              ))}
              {report.unbudgeted.length > 0 && (
                <li className="p-3">
                  <details>
                    <summary className="flex cursor-pointer justify-between gap-3 text-sm">
                      <span className="font-medium">Sin presupuesto</span>
                      <span>{formatMoney(unbudgetedTotal(report), report.currency)}</span>
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1 text-sm text-stone-600">
                      {report.unbudgeted.map((entry) => (
                        <li key={entry.categoryId} className="flex justify-between gap-3">
                          <span>{nameOf(entry.categoryId)}</span>
                          <span>{formatMoney(entry.amount, report.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              )}
            </ul>
            <p
              className={`flex justify-between gap-3 px-1 text-sm font-semibold ${
                report.total.status === 'EXCEEDED' ? 'text-red-700' : 'text-stone-900'
              }`}
            >
              <span>
                Total: {formatMoney(report.total.actual, report.currency)} de{' '}
                {formatMoney(report.total.planned, report.currency)}
              </span>
              <span>{varianceText(report.total, report.currency)}</span>
            </p>
          </section>
        );
      })}
    </div>
  );
}
