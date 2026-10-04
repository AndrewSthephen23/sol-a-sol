import { errorMessage } from '@/shared/api/problem';
import type { paths } from '@/shared/api/schema.gen';
import type { Currency } from '@/shared/format/money';

import { readAmount } from '@/features/transactions/amount-input';
import { categoriesById } from '@/features/transactions/labels';
import { formErrorFor } from '@/features/transactions/movement-form-model';
import type { Category, PaymentMethod } from '@/features/transactions/queries';

type InboxPage = paths['/api/v1/captures']['get']['responses'][200]['content']['application/json'];
export type Capture = InboxPage['items'][number];
export type CapturePatch = NonNullable<
  paths['/api/v1/captures/{id}']['patch']['requestBody']
>['content']['application/json'];

/**
 * Una captura se puede confirmar con un toque si tiene monto, moneda, categoría y algo con qué
 * describirla (la descripción o, si no, el comercio; decidido el 2026-10-04). Lo que falte, la
 * API lo diría igual con su error; esto solo evita ofrecer un botón que va a fallar.
 */
export function missingToConfirm(capture: Capture): string[] {
  const missing: string[] = [];
  if (capture.amount === null) missing.push('el monto');
  else if (capture.currency === null) missing.push('la moneda');
  if (capture.categoryId === null) missing.push('la categoría');
  if (capture.description === null && capture.merchant === null) missing.push('la descripción');
  return missing;
}

/** «Falta la categoría.» / «Faltan el monto y la categoría.» */
export function missingLabel(missing: readonly string[]): string {
  if (missing.length === 0) return '';
  const last = missing.at(-1) ?? '';
  const list = missing.length === 1 ? last : `${missing.slice(0, -1).join(', ')} y ${last}`;
  return `${missing.length === 1 ? 'Falta' : 'Faltan'} ${list}.`;
}

/**
 * Los avisos con que llega una captura, en palabras (los códigos son de la API y del parser, en
 * inglés). Uno que no se conoce no se muestra en crudo: se dice algo genérico.
 */
const WARNINGS: Readonly<Record<string, string>> = {
  UNKNOWN_SOURCE: 'No se reconoció el banco: solo se leyó el monto.',
  PARSER_FAILED: 'El formato de la notificación cambió: revísala.',
  AMOUNT_NOT_FOUND: 'No se encontró el monto.',
  AMBIGUOUS_AMOUNT: 'Había montos distintos: elige el correcto.',
  INVALID_AMOUNT: 'No se entendió el monto.',
  AMOUNT_MISMATCH: 'El monto del atajo y el de la notificación no coinciden.',
  CARD_NUMBER_MASKED: 'Traía el número completo de la tarjeta: se guardaron solo los últimos 4.',
  OPERATION_REJECTED: 'El banco rechazó la operación.',
  FUTURE_DATE: 'La fecha venía en el futuro: se puso la de hoy.',
  OLD_DATE: 'Es de hace más de 30 días.',
  CURRENCY_MISMATCH: 'La moneda no es la del método de pago.',
  PROCESSING_FAILED: 'No se pudo buscar el método ni la categoría: elígelos.',
};

export function warningLabel(code: string): string {
  return WARNINGS[code] ?? 'Hay algo que revisar.';
}

/**
 * El error de una acción de la bandeja: los de la transacción (al confirmar) como en el
 * formulario de movimientos, y los de la captura desde el mapa compartido.
 */
export function captureErrorMessage(code: string | null): string {
  return formErrorFor(code)?.message ?? errorMessage(code);
}

/** Lo que se escribe al corregir: todo como texto, como en el formulario de movimientos. */
export interface CorrectionValues {
  amount: string;
  currency: Currency | null;
  categoryId: string;
  paymentMethodId: string | null;
  date: string;
  merchant: string;
  description: string;
}

export type CorrectionField = keyof CorrectionValues;

export function correctionValuesFor(capture: Capture): CorrectionValues {
  return {
    amount: capture.amount ?? '',
    currency: capture.currency,
    categoryId: capture.categoryId ?? '',
    paymentMethodId: capture.paymentMethodId,
    date: capture.date,
    merchant: capture.merchant ?? '',
    description: capture.description ?? '',
  };
}

export interface CorrectionContext {
  categories: readonly Category[];
  paymentMethods: readonly PaymentMethod[];
  today: string;
}

export type CorrectionCheck =
  { body: CapturePatch } | { errors: Partial<Record<CorrectionField, string>> };

/**
 * Revisa lo corregido y arma el `PATCH`. La moneda la fija el método si tiene una sola; si no, la
 * elegida. **El tipo sale de la categoría**, como al registrar un movimiento: elegir «Honorarios»
 * vuelve ingreso la captura. Un monto vacío la deja sin monto (se puede confirmar después).
 */
export function checkCorrection(
  values: CorrectionValues,
  context: CorrectionContext,
): CorrectionCheck {
  const errors: Partial<Record<CorrectionField, string>> = {};
  const method = context.paymentMethods.find(({ id }) => id === values.paymentMethodId);
  const currency = method?.currency ?? values.currency;

  let amount: string | null = null;
  if (values.amount.trim() !== '') {
    const read = readAmount(values.amount, currency);
    if ('error' in read) errors.amount = read.error;
    else amount = read.amount;
  }
  if (values.date === '') errors.date = 'Elige la fecha.';
  else if (values.date > context.today) errors.date = 'La fecha no puede ser futura.';
  if (Object.keys(errors).length > 0) return { errors };

  const category =
    values.categoryId === ''
      ? undefined
      : categoriesById(context.categories).get(values.categoryId);

  return {
    body: {
      amount,
      currency,
      date: values.date,
      categoryId: category?.id ?? null,
      ...(category === undefined ? {} : { type: category.type }),
      paymentMethodId: values.paymentMethodId,
      merchant: values.merchant.trim() || null,
      description: values.description.trim() || null,
    },
  };
}
