import { TRANSACTION_TYPES, type TransactionType } from './filters';
import { paymentMethodLabel, TYPE_LABELS } from './labels';
import type { Category, PaymentMethod } from './queries';

const LAST_METHOD_KEY = 'sol-a-sol:last-payment-method';

/**
 * El último método de pago usado **en este navegador** (decidido con el autor el 2026-09-28). Es
 * una comodidad, no un dato: si el almacenamiento no está (modo privado, bloqueado), no pasa nada.
 */
export const lastPaymentMethod = {
  read(): string | null {
    try {
      return globalThis.localStorage.getItem(LAST_METHOD_KEY);
    } catch {
      return null;
    }
  },
  write(id: string | null): void {
    try {
      if (id === null) globalThis.localStorage.removeItem(LAST_METHOD_KEY);
      else globalThis.localStorage.setItem(LAST_METHOD_KEY, id);
    } catch {
      // Sin almacenamiento se pide cada vez; no es un error.
    }
  },
};

export interface Option {
  id: string;
  label: string;
}

export interface OptionGroup {
  label: string;
  options: Option[];
}

/** El gasto variable primero: es lo que más se registra. */
const TYPE_ORDER: readonly TransactionType[] = TRANSACTION_TYPES;

/**
 * Las categorías que se pueden elegir, agrupadas por tipo y con sus subcategorías debajo
 * («Comida › Mercado»). Solo las activas (las archivadas no se ofrecen), salvo `keep`: la que ya
 * tiene un movimiento que se corrige, para que siga a la vista.
 */
export function categoryGroups(
  tree: readonly Category[],
  keep: string | null = null,
): OptionGroup[] {
  const usable = (category: { id: string; archivedAt: string | null }) =>
    category.archivedAt === null || category.id === keep;

  return TYPE_ORDER.map((type) => ({
    label: TYPE_LABELS[type],
    options: tree
      .filter((category) => category.type === type)
      .flatMap((category) => [
        ...(usable(category) ? [{ id: category.id, label: category.name }] : []),
        ...category.children
          .filter(usable)
          .map((child) => ({ id: child.id, label: `${category.name} › ${child.name}` })),
      ]),
  })).filter((group) => group.options.length > 0);
}

/** Los métodos de pago que se pueden elegir: los activos, más `keep` si está archivado. */
export function paymentMethodOptions(
  methods: readonly PaymentMethod[],
  keep: string | null = null,
): Option[] {
  return methods
    .filter((method) => method.archivedAt === null || method.id === keep)
    .map((method) => ({
      id: method.id,
      label: `${paymentMethodLabel(method)}${method.archivedAt === null ? '' : ' (archivado)'}`,
    }));
}
