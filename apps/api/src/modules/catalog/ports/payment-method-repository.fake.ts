import { PaymentMethodAliasTakenError } from '../domain/errors.js';
import type {
  NewPaymentMethod,
  PaymentMethod,
  PaymentMethodChanges,
  PaymentMethodRepository,
} from './payment-method-repository.js';

interface Row extends PaymentMethod {
  userId: string;
}

/**
 * Repositorio en memoria para probar los casos de uso sin base de datos. Imita el índice único
 * de la base: alias por usuario, sin distinguir mayúsculas y contando los archivados.
 */
export class FakePaymentMethodRepository implements PaymentMethodRepository {
  readonly rows: Row[] = [];
  private sequence = 0;

  constructor(private readonly now = new Date('2026-09-23T15:00:00.000Z')) {}

  create(method: NewPaymentMethod): Promise<PaymentMethod> {
    this.assertAliasFree(method.userId, method.alias);
    this.sequence += 1;
    const row: Row = {
      ...method,
      id: `01999999-9999-7999-8999-${String(this.sequence).padStart(12, '0')}`,
      archivedAt: null,
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.rows.push(row);

    return Promise.resolve(publicOf(row));
  }

  list(userId: string, options: { includeArchived: boolean }): Promise<PaymentMethod[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId)
        .filter((row) => options.includeArchived || row.archivedAt === null)
        .toSorted((a, b) => a.alias.localeCompare(b.alias))
        .map(publicOf),
    );
  }

  find(userId: string, id: string): Promise<PaymentMethod | null> {
    const row = this.rowOf(userId, id);

    return Promise.resolve(row === undefined ? null : publicOf(row));
  }

  update(userId: string, id: string, changes: PaymentMethodChanges): Promise<PaymentMethod | null> {
    const row = this.rowOf(userId, id);
    if (row === undefined) return Promise.resolve(null);
    if (changes.alias !== undefined) this.assertAliasFree(userId, changes.alias, id);
    Object.assign(row, changes, { updatedAt: this.now });

    return Promise.resolve(publicOf(row));
  }

  private rowOf(userId: string, id: string): Row | undefined {
    return this.rows.find((row) => row.userId === userId && row.id === id);
  }

  private assertAliasFree(userId: string, alias: string, exceptId?: string): void {
    const taken = this.rows.some(
      (row) =>
        row.userId === userId &&
        row.id !== exceptId &&
        row.alias.toLowerCase() === alias.toLowerCase(),
    );
    if (taken) throw new PaymentMethodAliasTakenError();
  }
}

/** Una copia sin `userId`, como la que devuelve el adaptador de Prisma. */
function publicOf(row: Row): PaymentMethod {
  return {
    id: row.id,
    kind: row.kind,
    alias: row.alias,
    institution: row.institution,
    last4: row.last4,
    currency: row.currency,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
