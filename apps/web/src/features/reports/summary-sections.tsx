import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatMoney } from '@/shared/format/money';

import {
  budgetExecutionText,
  cardTitle,
  chargesText,
  comparisonText,
  contributedText,
  type CurrencySummary,
  exceededText,
  goalProgressText,
  merchantText,
  type MonthlySummary,
  savingsRateText,
  shareText,
  statementText,
  TYPE_LABELS,
} from './summary-model';

const CARD = 'flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-4';
const LIST = 'flex flex-col divide-y divide-stone-100 text-sm';
const CURRENCY_TITLES = { PEN: 'Soles', USD: 'Dólares' } as const;

/** Una sección con su título, para que un lector de pantalla la encuentre por nombre. */
function Section({
  id,
  title,
  children,
}: Readonly<{ id: string; title: string; children: ReactNode }>) {
  return (
    <section aria-labelledby={id} className={CARD}>
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Totales, ahorro, comparación y tops de una moneda: todo en texto. */
export function CurrencySection({
  entry,
  against,
  categoryName,
}: Readonly<{ entry: CurrencySummary; against: string; categoryName: (id: string) => string }>) {
  const { currency } = entry;
  const id = `summary-${currency}`;

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {CURRENCY_TITLES[currency]}
      </h2>

      <Section id={`${id}-totals`} title="Lo que entró y salió">
        <ul className={LIST}>
          {entry.byType.map((row) => (
            <li key={row.type} className="flex flex-col py-1 sm:flex-row sm:justify-between">
              <span>
                {TYPE_LABELS[row.type]}: <strong>{formatMoney(row.amount, currency)}</strong>
              </span>
              <span className="text-stone-500">{comparisonText(row, currency, against)}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm font-medium">
          Saldo del mes: {formatMoney(entry.totals.balance, currency)}
        </p>
        <p className="text-sm">{savingsRateText(entry.savingsRate)}</p>
      </Section>

      {entry.topCategories.length > 0 && (
        <Section id={`${id}-categories`} title="En qué gastaste más">
          <ol className={LIST}>
            {entry.topCategories.map((row) => (
              <li key={row.categoryId} className="py-1">
                {categoryName(row.categoryId)}: {formatMoney(row.amount, currency)}
                {shareText(row.share)}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {entry.topMerchants.length > 0 && (
        <Section id={`${id}-merchants`} title="Dónde gastaste más">
          <ol className={LIST}>
            {entry.topMerchants.map((row) => (
              <li key={row.merchant} className="py-1">
                {merchantText(row, currency)}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {entry.byCategory.length > 0 && (
        <Section id={`${id}-by-category`} title={`Por categoría, comparado ${against}`}>
          <ul className={LIST}>
            {entry.byCategory.map((row) => (
              <li
                key={`${row.type}-${row.categoryId}`}
                className="flex flex-col py-1 sm:flex-row sm:justify-between"
              >
                <span>
                  {categoryName(row.categoryId)}: {formatMoney(row.amount, currency)}
                </span>
                <span className="text-stone-500">{comparisonText(row, currency, against)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </section>
  );
}

/** Lo ejecutado del presupuesto y lo que se pasó; o que no hay presupuesto. */
export function BudgetSection({
  budget,
  month,
  categoryName,
}: Readonly<{
  budget: NonNullable<MonthlySummary['budget']>;
  month: string;
  categoryName: (id: string) => string;
}>) {
  return (
    <Section id="summary-budget" title="Presupuesto">
      {budget.status === 'NONE' ? (
        <p className="text-sm text-stone-600">
          No armaste un presupuesto para este mes.{' '}
          <Link href={`/budgeting?month=${month}`} className="font-medium text-amber-700 underline">
            Armarlo
          </Link>
        </p>
      ) : (
        <>
          {budget.currencies.map((row) => (
            <p key={row.currency} className="text-sm">
              {budgetExecutionText(row)}
            </p>
          ))}
          {budget.exceeded.length === 0 ? (
            <p className="text-sm text-green-700">No te pasaste en ninguna partida.</p>
          ) : (
            <ul className={LIST}>
              {budget.exceeded.map((line) => (
                <li key={`${line.currency}-${line.categoryId}`} className="py-1 text-red-700">
                  {exceededText(line, categoryName(line.categoryId))}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

/** Lo consumido en el mes y lo que hay que pagar el mes siguiente, por tarjeta. */
export function CardsSection({ summary }: Readonly<{ summary: MonthlySummary }>) {
  const cards = summary.cards ?? [];

  return (
    <Section id="summary-cards" title="Tarjetas">
      {cards.length === 0 ? (
        <p className="text-sm text-stone-600">No tienes tarjetas configuradas.</p>
      ) : (
        <ul className={LIST}>
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-1 py-2">
              <p className="font-medium">{cardTitle(card)}</p>
              <p>{chargesText(card, summary)}</p>
              {card.statement !== null && <p>{statementText(card.statement)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Lo aportado a cada meta en el mes y cómo quedó al cierre. */
export function GoalsSection({ goals }: Readonly<{ goals: NonNullable<MonthlySummary['goals']> }>) {
  return (
    <Section id="summary-goals" title="Metas">
      {goals.length === 0 ? (
        <p className="text-sm text-stone-600">No tenías metas activas este mes.</p>
      ) : (
        <ul className={LIST}>
          {goals.map((goal) => (
            <li key={goal.id} className="flex flex-col gap-1 py-2">
              <p className="font-medium">{goal.name}</p>
              <p>{contributedText(goal)}</p>
              <p>{goalProgressText(goal)}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
