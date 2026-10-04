import type { CaptureAmount, CaptureStatus, LocalDate, TransactionType } from '@sol-a-sol/domain';

export type CaptureSource = 'IOS_SHORTCUT' | 'ANDROID_AUTOMATION';

/** Una captura guardada, con lo que se entendió y su pedido crudo mientras no se confirme. */
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
  /** El pedido tal cual llegó, con las tarjetas tapadas. Nulo en una confirmada (decisión 14). */
  rawPayload: Record<string, string> | null;
  discardedAt: Date | null;
  /** De dónde se descartó, para devolverla como estaba. */
  discardedFrom: 'PENDING' | 'DUPLICATE' | null;
  /** La transacción que salió al confirmarla. */
  transactionId: string | null;
  createdAt: Date;
}

/** Dónde quedó la última captura de una página: la siguiente empieza después. */
export interface CapturePosition {
  occurredAt: Date;
  id: string;
}

/** Lo que cambia al corregir, descartar o deshacer. */
export type CaptureChanges = Partial<
  Pick<
    Capture,
    | 'status'
    | 'type'
    | 'businessDate'
    | 'amount'
    | 'categoryId'
    | 'paymentMethodId'
    | 'merchant'
    | 'description'
    | 'discardedAt'
    | 'discardedFrom'
    | 'transactionId'
  >
>;

export interface NewCapture extends Omit<
  Capture,
  'id' | 'createdAt' | 'rawPayload' | 'discardedAt' | 'discardedFrom' | 'transactionId'
> {
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

  /** `null` si no existe **o es de otra cuenta**. */
  find(userId: string, id: string): Promise<Capture | null>;

  /**
   * Una página de las de la cuenta en esos estados, de la más reciente a la más antigua (por
   * instante y luego por id), empezando **después** de `after`.
   */
  list(
    userId: string,
    statuses: readonly Capture['status'][],
    page: { after: CapturePosition | null; limit: number },
  ): Promise<Capture[]>;

  /**
   * Cambia la captura **solo si sigue en uno de esos estados**: si otra petición la confirmó o la
   * descartó entretanto, no la toca. `null` si no existe, es de otra cuenta o cambió de estado.
   */
  update(
    userId: string,
    id: string,
    changes: CaptureChanges,
    expected: readonly Capture['status'][],
  ): Promise<Capture | null>;

  /** Las de la bandeja (por revisar y duplicadas) con su día de negocio entre esos dos, incluidos. */
  listInboxBetween(userId: string, from: LocalDate, to: LocalDate): Promise<Capture[]>;

  /** Las de la bandeja (por revisar y duplicadas) que todavía no tienen categoría. */
  listUncategorizedInInbox(userId: string): Promise<Capture[]>;

  /**
   * Las capturas sin confirmar de una categoría fusionada pasan a la destino (ADR-0005). Las
   * confirmadas no: ya son una transacción, que sigue a la fusión por su lado. Cuántas.
   */
  reassignCategory(userId: string, fromId: string, intoId: string): Promise<number>;

  /** Borra del todo las descartadas de la cuenta antes de ese instante. Cuántas borró. */
  deleteDiscardedBefore(userId: string, cutoff: Date): Promise<number>;
}

export const CAPTURE_REPOSITORY = Symbol('CaptureRepository');
