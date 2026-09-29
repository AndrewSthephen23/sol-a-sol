import type { paths } from '@/shared/api/schema.gen';
import type { Currency } from '@/shared/format/money';

import { readAmount } from './amount-input';
import type { CategoryInfo } from './labels';
import type { PaymentMethod } from './queries';

export type TransactionBody =
  paths['/api/v1/transactions']['post']['requestBody']['content']['application/json'];
export type TransferBody =
  paths['/api/v1/transfers']['post']['requestBody']['content']['application/json'];

/** Lo que se escribe en el formulario: todo texto, tal como está en los campos. */
export interface TransactionValues {
  date: string;
  categoryId: string;
  amount: string;
  /** Solo cuenta si el método de pago no fija la moneda (bimoneda o sin método). */
  currency: Currency | null;
  paymentMethodId: string | null;
  description: string;
  merchant: string;
  /** Separadas por comas: `viaje, trabajo`. */
  tags: string;
}

export interface TransferValues {
  date: string;
  fromPaymentMethodId: string;
  toPaymentMethodId: string;
  amount: string;
  /** Solo cuenta si la cuenta de origen es bimoneda. */
  currency: Currency | null;
  /** Solo cuenta si la moneda cambia: nunca se convierte. */
  receivedAmount: string;
  description: string;
}

export type TransactionField = keyof TransactionValues;
export type TransferField = keyof TransferValues;
export type FieldErrors<F extends string> = Partial<Record<F, string>>;

export type Checked<B, F extends string> = { body: B } | { errors: FieldErrors<F> };

export interface FormContext {
  categories: ReadonlyMap<string, CategoryInfo>;
  paymentMethods: ReadonlyMap<string, PaymentMethod>;
  /** Hoy en Lima, `YYYY-MM-DD`: una transacción registra algo que ya pasó. */
  today: string;
}

/** Topes del dominio: 10 etiquetas distintas, sin `|` y de hasta 40 caracteres. */
export const MAX_TAGS = 10;
const TAG_MAX_LENGTH = 40;

/** La moneda que fija el método de pago, o `null` si hay que elegirla (bimoneda o sin método). */
export function fixedCurrency(method: PaymentMethod | undefined): Currency | null {
  return method?.currency ?? null;
}

function checkDate(date: string, today: string): string | undefined {
  if (date === '') return 'Elige la fecha.';
  if (date > today) return 'La fecha no puede ser futura: se registra lo que ya pasó.';

  return undefined;
}

/**
 * `viaje, Trabajo ,viaje` → `['viaje', 'Trabajo']`. Las repetidas cuentan una vez, sin distinguir
 * mayúsculas ni tildes, igual que en la API.
 */
export function readTags(text: string): { tags: string[] } | { error: string } {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(',')) {
    const tag = raw.trim();
    if (tag === '') continue;
    if (tag.includes('|')) return { error: 'Una etiqueta no puede llevar «|».' };
    if (tag.length > TAG_MAX_LENGTH) {
      return { error: `Cada etiqueta puede tener hasta ${String(TAG_MAX_LENGTH)} caracteres.` };
    }
    const key = tag.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  if (tags.length > MAX_TAGS)
    return { error: `Hasta ${String(MAX_TAGS)} etiquetas por movimiento.` };

  return { tags };
}

/**
 * Revisa lo escrito y arma el cuerpo para la API. Las reglas de verdad están en el dominio y la
 * API las vuelve a aplicar; aquí solo se evita mandar algo que ya se sabe que no pasa.
 *
 * El tipo sale de la categoría (una categoría es de un solo tipo) y, si no se escribió
 * descripción, se propone el nombre de la categoría (decidido con el autor el 2026-09-28).
 */
export function checkTransaction(
  values: TransactionValues,
  { categories, paymentMethods, today }: FormContext,
): Checked<TransactionBody, TransactionField> {
  const errors: FieldErrors<TransactionField> = {};
  const category = categories.get(values.categoryId);
  const method =
    values.paymentMethodId === null ? undefined : paymentMethods.get(values.paymentMethodId);
  const currency = fixedCurrency(method) ?? values.currency;

  if (category === undefined) errors.categoryId = 'Elige una categoría.';
  if (currency === null) errors.currency = 'Elige la moneda.';
  const amount = readAmount(values.amount, currency);
  if ('error' in amount) errors.amount = amount.error;
  const date = checkDate(values.date, today);
  if (date !== undefined) errors.date = date;
  const tags = readTags(values.tags);
  if ('error' in tags) errors.tags = tags.error;

  if (
    category === undefined ||
    currency === null ||
    'error' in amount ||
    'error' in tags ||
    date !== undefined
  ) {
    return { errors };
  }

  const merchant = values.merchant.trim();

  return {
    body: {
      date: values.date,
      type: category.type,
      categoryId: category.id,
      amount: amount.amount,
      currency,
      description: values.description.trim() || category.name,
      paymentMethodId: method?.id ?? null,
      merchant: merchant === '' ? null : merchant,
      tags: tags.tags,
    },
  };
}

/**
 * Lo mismo para una transferencia. Las monedas salen de las cuentas; si cambian, se pide lo que
 * llegó, copiado del voucher, porque nunca se convierte.
 */
export function checkTransfer(
  values: TransferValues,
  { paymentMethods, today }: FormContext,
): Checked<TransferBody, TransferField> {
  const errors: FieldErrors<TransferField> = {};
  const from = paymentMethods.get(values.fromPaymentMethodId);
  const to = paymentMethods.get(values.toPaymentMethodId);

  if (from === undefined) errors.fromPaymentMethodId = 'Elige la cuenta de origen.';
  if (to === undefined) errors.toPaymentMethodId = 'Elige la cuenta de destino.';
  else if (to.id === from?.id)
    errors.toPaymentMethodId = 'Elige una cuenta distinta a la de origen.';
  const currency = fixedCurrency(from) ?? values.currency;
  if (from !== undefined && currency === null) errors.currency = 'Elige la moneda.';
  const amount = readAmount(values.amount, currency);
  if ('error' in amount) errors.amount = amount.error;
  // Una cuenta de destino bimoneda recibe en la moneda que se envía.
  const receivedCurrency = fixedCurrency(to) ?? currency;
  const changes = currency !== null && receivedCurrency !== null && receivedCurrency !== currency;
  const received = changes ? readAmount(values.receivedAmount, receivedCurrency) : undefined;
  if (received !== undefined && 'error' in received) {
    errors.receivedAmount =
      values.receivedAmount.trim() === ''
        ? 'Escribe cuánto llegó: la moneda cambia y nunca se convierte.'
        : received.error;
  }
  const date = checkDate(values.date, today);
  if (date !== undefined) errors.date = date;

  if (
    Object.keys(errors).length > 0 ||
    from === undefined ||
    to === undefined ||
    currency === null ||
    receivedCurrency === null ||
    'error' in amount ||
    (received !== undefined && 'error' in received)
  ) {
    return { errors };
  }

  return {
    body: {
      date: values.date,
      fromPaymentMethodId: from.id,
      toPaymentMethodId: to.id,
      amount: amount.amount,
      currency,
      receivedAmount: received?.amount ?? amount.amount,
      receivedCurrency,
      description: values.description.trim() || `Transferencia ${from.alias} → ${to.alias}`,
    },
  };
}

/** Dónde mostrar un error de la API y con qué texto. `field` ausente: arriba del formulario. */
export interface FormError<F extends string> {
  field?: F;
  message: string;
}

const API_ERRORS: Readonly<
  Record<string, { field?: TransactionField | TransferField; message: string }>
> = {
  INVALID_AMOUNT: { field: 'amount', message: 'El monto puede tener hasta 2 decimales.' },
  TRANSACTION_AMOUNT_NOT_POSITIVE: {
    field: 'amount',
    message: 'El monto tiene que ser mayor que cero.',
  },
  TRANSFER_AMOUNT_NOT_POSITIVE: {
    field: 'amount',
    message: 'El monto tiene que ser mayor que cero.',
  },
  TRANSACTION_DATE_IN_FUTURE: { field: 'date', message: 'La fecha no puede ser futura.' },
  TRANSACTION_CURRENCY_REQUIRED: { field: 'currency', message: 'Elige la moneda.' },
  CURRENCY_MISMATCH: {
    field: 'currency',
    message: 'La moneda no coincide con la del método de pago.',
  },
  CATEGORY_TYPE_MISMATCH: { field: 'categoryId', message: 'La categoría es de otro tipo.' },
  CATEGORY_ARCHIVED: { field: 'categoryId', message: 'Esa categoría está archivada.' },
  CATEGORY_NOT_FOUND: { field: 'categoryId', message: 'Esa categoría ya no existe.' },
  PAYMENT_METHOD_ARCHIVED: {
    field: 'paymentMethodId',
    message: 'Ese método de pago está archivado.',
  },
  PAYMENT_METHOD_NOT_FOUND: {
    field: 'paymentMethodId',
    message: 'Ese método de pago ya no existe.',
  },
  TOO_MANY_TAGS: { field: 'tags', message: `Hasta ${String(MAX_TAGS)} etiquetas por movimiento.` },
  TAG_NAME_INVALID: { field: 'tags', message: 'Alguna etiqueta no es válida.' },
  TRANSFER_SAME_ACCOUNT: {
    field: 'toPaymentMethodId',
    message: 'Elige una cuenta distinta a la de origen.',
  },
  TRANSFER_CURRENCY_MISMATCH: {
    field: 'currency',
    message: 'La moneda no coincide con la de la cuenta.',
  },
  TRANSFER_RECEIVED_AMOUNT_REQUIRED: {
    field: 'receivedAmount',
    message: 'Escribe cuánto llegó: la moneda cambia y nunca se convierte.',
  },
  TRANSFER_RECEIVED_AMOUNT_MISMATCH: {
    field: 'receivedAmount',
    message: 'En la misma moneda, llega lo mismo que sale.',
  },
  TRANSACTION_NOT_FOUND: { message: 'Este movimiento ya no existe.' },
  TRANSFER_NOT_FOUND: { message: 'Esta transferencia ya no existe.' },
};

/** El error de la API traducido y, si se sabe, pegado a su campo. */
export function formErrorFor(
  code: string | null,
): FormError<TransactionField | TransferField> | null {
  return code === null ? null : (API_ERRORS[code] ?? null);
}
