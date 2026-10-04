import { DomainError } from '../errors/domain-error.js';
import { type Currency } from '../currency/currency.js';
import { Money } from '../money/money.js';
import { type LocalDate } from '../time/local-date.js';
import {
  assertTransactionAmount,
  type TransactionType,
} from '../transactions/transaction-policy.js';
import { type CaptureAmount } from './capture-amount.js';
import { CaptureNotPendingError } from './capture-confirmation.js';
import { type CaptureStatus } from './capture-duplicates.js';
import { cleanText } from './clean-text.js';

/** Cuánto se guarda una captura descartada antes de borrarla del todo (decisión 11 de H7). */
export const DISCARDED_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Las que están en la bandeja: por revisar y duplicadas. */
type InboxStatus = Extract<CaptureStatus, 'PENDING' | 'DUPLICATE'>;

export class CaptureNotDiscardedError extends DomainError {
  readonly code = 'CAPTURE_NOT_DISCARDED';

  constructor() {
    super('Only a discarded capture can be restored.');
  }
}

/** Solo una captura de la bandeja se corrige, se confirma o se descarta. */
export function assertInInbox(status: CaptureStatus): asserts status is InboxStatus {
  if (status !== 'PENDING' && status !== 'DUPLICATE') throw new CaptureNotPendingError();
}

export interface DiscardState {
  status: CaptureStatus;
  discardedAt: Date | null;
  discardedFrom: InboxStatus | null;
}

/**
 * Descarta una captura de la bandeja y recuerda **de dónde** vino, para que «Deshacer» la
 * devuelva como estaba (decisión 11; decidido el 2026-10-04).
 */
export function discardCapture(status: CaptureStatus, at: Date): DiscardState {
  assertInInbox(status);
  return { status: 'DISCARDED', discardedAt: at, discardedFrom: status };
}

/**
 * Deshace un descarte: la captura vuelve como estaba, duplicada o por revisar. Una de origen
 * desconocido (la base lo exige, así que no debería haber) vuelve por revisar.
 */
export function restoreCapture(
  status: CaptureStatus,
  discardedFrom: InboxStatus | null,
): DiscardState {
  if (status !== 'DISCARDED') throw new CaptureNotDiscardedError();
  return { status: discardedFrom ?? 'PENDING', discardedAt: null, discardedFrom: null };
}

/** Las descartadas antes de este instante se borran del todo. */
export function discardedPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - DISCARDED_RETENTION_DAYS * DAY_MS);
}

/** Lo que se corrige de una captura en la bandeja. */
export interface CaptureFields {
  type: TransactionType;
  date: LocalDate;
  amount: CaptureAmount | null;
  categoryId: string | null;
  paymentMethodId: string | null;
  merchant: string | null;
  description: string | null;
}

/** Lo que llega a corregir: lo que no viene no cambia, y `null` lo borra. */
export interface CaptureCorrection {
  type?: TransactionType;
  date?: LocalDate;
  /** String decimal, mayor que cero y con 2 decimales a lo más. */
  amount?: string | null;
  currency?: Currency | null;
  categoryId?: string | null;
  paymentMethodId?: string | null;
  merchant?: string | null;
  description?: string | null;
}

/**
 * Aplica una corrección de la bandeja (decisión 10: se corrige todo). Si cambia el tipo y no se
 * elige categoría, la que había **se limpia**: la categoría es del tipo de la captura (decidido el
 * 2026-10-03). Un monto se valida como el de una transacción; uno sin moneda sigue sin ella hasta
 * que se elija. Que la categoría y el método existan y se puedan usar lo comprueba el caso de uso.
 */
export function correctCapture(current: CaptureFields, changes: CaptureCorrection): CaptureFields {
  const type = changes.type ?? current.type;
  const typeChanged = type !== current.type;

  return {
    type,
    date: changes.date ?? current.date,
    amount: correctedAmount(current.amount, changes),
    categoryId:
      changes.categoryId !== undefined
        ? changes.categoryId
        : typeChanged
          ? null
          : current.categoryId,
    paymentMethodId:
      changes.paymentMethodId === undefined ? current.paymentMethodId : changes.paymentMethodId,
    merchant: changes.merchant === undefined ? current.merchant : cleanText(changes.merchant),
    description:
      changes.description === undefined ? current.description : cleanText(changes.description),
  };
}

function correctedAmount(
  current: CaptureAmount | null,
  changes: CaptureCorrection,
): CaptureAmount | null {
  const value = changes.amount === undefined ? (current?.value ?? null) : changes.amount;
  if (value === null) return null;
  const currency = changes.currency === undefined ? (current?.currency ?? null) : changes.currency;

  // Se valida como el monto de una transacción: con una moneda cualquiera si todavía no tiene,
  // porque lo que importa aquí es el número.
  const money = Money.of(value, currency ?? 'PEN');
  assertTransactionAmount(money);
  return { value: money.toFixed(), currency };
}
