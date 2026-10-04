import { type Money } from '../money/money.js';
import { searchKey } from '../text/search-key.js';
import { type LocalDate } from '../time/local-date.js';
import { type CaptureAmount } from './capture-amount.js';

/** Hasta cuánto antes o después otra captura cuenta como la misma (decisión 6 de H7). */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export type CaptureStatus = 'PENDING' | 'CONFIRMED' | 'DISCARDED' | 'DUPLICATE';

/** La captura que acaba de llegar. */
export interface DuplicateProbe {
  amount: CaptureAmount | null;
  merchant: string | null;
  occurredAt: Date;
  /** Su fecha de negocio, para compararla con las transacciones, que no tienen hora. */
  date: LocalDate;
}

/** Otra captura de la cuenta. */
export interface CapturedMovement {
  id: string;
  amount: CaptureAmount | null;
  merchant: string | null;
  occurredAt: Date;
  status: CaptureStatus;
}

/** Una transacción vigente de la cuenta. */
export interface RecordedMovement {
  id: string;
  amount: Money;
  merchant: string | null;
  description: string;
  date: LocalDate;
}

export type Duplicate = { kind: 'CAPTURE'; id: string } | { kind: 'TRANSACTION'; id: string };

/**
 * ¿Ya se registró esta captura? (decisión 6 de H7). Mismo monto, misma moneda y mismo comercio
 * (sin tildes ni mayúsculas), y además:
 *
 * - contra **otra captura**, en **±2 minutos**, bordes incluidos (2:00 sí, 2:01 no). Una
 *   descartada no cuenta: se dijo que no era real;
 * - contra una **transacción**, el **mismo día**, porque no tienen hora. Si la transacción no tiene
 *   comercio, se compara con su descripción (decidido el 2026-10-04).
 *
 * Sin monto, sin moneda o sin comercio no hay con qué comparar y no se marca nada. Primero se
 * busca entre las capturas. Una duplicada **se puede confirmar igual**.
 */
export function findDuplicate(
  probe: DuplicateProbe,
  captures: readonly CapturedMovement[],
  transactions: readonly RecordedMovement[],
): Duplicate | null {
  const merchant = keyOf(probe.merchant);
  const { amount } = probe;
  if (merchant === null || amount?.currency == null) return null;

  const capture = captures.find(
    (other) =>
      other.status !== 'DISCARDED' &&
      Math.abs(other.occurredAt.getTime() - probe.occurredAt.getTime()) <= DUPLICATE_WINDOW_MS &&
      other.amount?.value === amount.value &&
      other.amount.currency === amount.currency &&
      keyOf(other.merchant) === merchant,
  );
  if (capture !== undefined) return { kind: 'CAPTURE', id: capture.id };

  const transaction = transactions.find(
    (other) =>
      other.date.equals(probe.date) &&
      other.amount.toFixed() === amount.value &&
      other.amount.currency === amount.currency &&
      keyOf(other.merchant ?? other.description) === merchant,
  );
  return transaction === undefined ? null : { kind: 'TRANSACTION', id: transaction.id };
}

function keyOf(text: string | null): string | null {
  if (text === null) return null;
  const key = searchKey(text);
  return key === '' ? null : key;
}
