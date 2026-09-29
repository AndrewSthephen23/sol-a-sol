import type { Show, TransactionType } from './filters';
import type { Category, PaymentMethod } from './queries';

/** Nombres del glosario (`docs/glosario.md`): los enums van en inglés, la interfaz en español. */
export const TYPE_LABELS: Readonly<Record<TransactionType, string>> = {
  INCOME: 'Ingreso',
  FIXED_EXPENSE: 'Gasto fijo',
  VARIABLE_EXPENSE: 'Gasto variable',
  SAVING: 'Ahorro',
  INVESTMENT: 'Inversión',
  DEBT: 'Deuda',
};

export const SHOW_LABELS: Readonly<Record<Show, string>> = {
  ALL: 'Todo',
  ...TYPE_LABELS,
  TRANSFER: 'Transferencias',
};

/** Solo el ingreso suma: el balance es ingresos menos todo lo demás, igual que en la API. */
export function signOf(type: TransactionType): '+' | '-' {
  return type === 'INCOME' ? '+' : '-';
}

/** Lo común a una categoría y a una subcategoría. */
export type CategoryInfo = Omit<Category, 'children'>;

/** Categorías y subcategorías por id, para poner nombre a cada movimiento. */
export function categoriesById(tree: readonly Category[]): Map<string, CategoryInfo> {
  const byId = new Map<string, CategoryInfo>();
  for (const { children, ...category } of tree) {
    byId.set(category.id, category);
    for (const child of children) byId.set(child.id, child);
  }

  return byId;
}

/** «BCP Sueldo» o «Visa ···· 1234»: los últimos 4 son lo único que se guarda de una tarjeta. */
export function paymentMethodLabel(method: PaymentMethod): string {
  return method.last4 === null ? method.alias : `${method.alias} ···· ${method.last4}`;
}
