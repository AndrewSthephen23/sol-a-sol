import { CURRENCIES, type Currency } from '../currency/currency.js';
import { Money } from '../money/money.js';
import {
  countsAsExpense,
  countsAsSaving,
  signedAmount,
  type TransactionType,
} from './transaction-policy.js';

/** Los totales de un conjunto de transacciones en una moneda. */
export interface TransactionTotals {
  currency: Currency;
  income: Money;
  /** Gasto fijo + variable. */
  expense: Money;
  /** Ahorro + inversión. */
  saving: Money;
  debt: Money;
  /** Lo que queda: el ingreso suma y todo lo demás resta. Puede ser negativo. */
  balance: Money;
}

/** Un monto de un tipo: una transacción, o la suma de varias del mismo tipo y moneda. */
export interface TypedAmount {
  type: TransactionType;
  amount: Money;
}

/**
 * Totales **por moneda**, sin convertir nunca: ingresos, gasto, ahorro, deuda y saldo, con las
 * mismas reglas que decidió el autor para todo el producto (`countsAsExpense`, `countsAsSaving`,
 * `signedAmount`). Solo aparecen las monedas con movimientos, primero los soles.
 */
export function totalsByCurrency(entries: readonly TypedAmount[]): TransactionTotals[] {
  return CURRENCIES.flatMap((currency) => {
    const inCurrency = entries.filter((entry) => entry.amount.currency === currency);
    if (inCurrency.length === 0) return [];

    const sum = (include: (type: TransactionType) => boolean): Money =>
      inCurrency
        .filter((entry) => include(entry.type))
        .reduce((total, entry) => total.add(entry.amount), Money.zero(currency));

    return [
      {
        currency,
        income: sum((type) => type === 'INCOME'),
        expense: sum(countsAsExpense),
        saving: sum(countsAsSaving),
        debt: sum((type) => type === 'DEBT'),
        balance: inCurrency.reduce(
          (total, entry) => total.add(signedAmount(entry.type, entry.amount)),
          Money.zero(currency),
        ),
      },
    ];
  });
}
