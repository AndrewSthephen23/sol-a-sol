import type { CaptureAmount, CaptureStatus, LocalDate, TransactionType } from '@sol-a-sol/domain';

export type CaptureSource = 'IOS_SHORTCUT' | 'ANDROID_AUTOMATION';

/** Una captura guardada, con lo que se entendió. El pedido crudo no sale de la base aquí. */
export interface Capture {
  id: string;
  source: CaptureSource;
  status: CaptureStatus;
  type: TransactionType;
  occurredAt: Date;
  businessDate: LocalDate;
  /** Puede ir sin moneda (decisión 3): se elige en la bandeja. */
  amount: CaptureAmount | null;
  merchant: string | null;
  cardLast4: string | null;
  description: string | null;
  categoryId: string | null;
  paymentMethodId: string | null;
  warnings: string[];
  createdAt: Date;
}

export interface NewCapture extends Omit<Capture, 'id' | 'createdAt'> {
  /** El pedido tal cual llegó, con los números de tarjeta ya tapados. */
  rawPayload: Record<string, string>;
  idempotencyKey: string;
}

/** Otra petición guardó la misma clave a la vez: la captura ya existe. */
export class IdempotencyKeyTakenError extends Error {
  constructor() {
    super('Another request saved a capture with the same idempotency key.');
  }
}

/**
 * Las capturas, siempre de una cuenta: cada método **exige el `userId`**, que va dentro de la
 * consulta, nunca en una comprobación aparte.
 */
export interface CaptureRepository {
  /** La captura de la cuenta con esa clave de idempotencia. Otra cuenta puede usar la misma. */
  findByIdempotencyKey(userId: string, key: string): Promise<Capture | null>;

  /** Lanza `IdempotencyKeyTakenError` si la cuenta ya tiene una captura con esa clave. */
  create(userId: string, capture: NewCapture): Promise<Capture>;

  /** Las de la cuenta que pasaron entre esos dos instantes, los dos incluidos. */
  listOccurredBetween(userId: string, from: Date, to: Date): Promise<Capture[]>;
}

export const CAPTURE_REPOSITORY = Symbol('CaptureRepository');
