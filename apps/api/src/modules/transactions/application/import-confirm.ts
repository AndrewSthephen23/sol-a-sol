import { Inject, Injectable } from '@nestjs/common';
import type { CategoryDecision, PaymentMethodDecision } from '@sol-a-sol/contracts';
import {
  assertValidPaymentMethod,
  type Clock,
  type Currency,
  DomainError,
  type ImportedTransaction,
  type ImportedTransfer,
  resolveTransferAmounts,
  type RowProblem,
  searchKey,
  today,
} from '@sol-a-sol/domain';

import { EVENT_PUBLISHER, type EventPublisher } from '../../../shared/events/event-publisher.js';
import { CLOCK } from '../../../shared/time/system-clock.js';
import {
  ImportDecisionInvalidError,
  ImportHasProblemsError,
  ImportUnresolvedError,
} from '../domain/errors.js';
import {
  TRANSACTION_CREATED,
  TRANSFER_CREATED,
  type TransactionCreated,
  type TransferCreated,
} from '../domain/events.js';
import { CATALOG_READER, type CatalogReader } from '../ports/catalog-reader.js';
import { CATALOG_WRITER, type CatalogWriter } from '../ports/catalog-writer.js';
import { IMPORT_WRITER, type ImportWriter } from '../ports/import-writer.js';
import {
  type NewTransaction,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../ports/transaction-repository.js';
import {
  type NewTransfer,
  TRANSFER_REPOSITORY,
  type TransferRepository,
} from '../ports/transfer-repository.js';
import {
  AccountNames,
  categoryKey,
  importKeyOf,
  lengthProblems,
  problem,
  readImportFile,
  type Unresolved,
} from './import-file.js';

export interface ConfirmImportInput {
  userId: string;
  csv: string;
  categories: readonly CategoryDecision[];
  paymentMethods: readonly PaymentMethodDecision[];
}

/** Lo que entró. */
export interface ImportResult {
  transactions: number;
  transfers: number;
  /** Líneas que ya se habían importado antes: se omitieron. */
  alreadyImported: number[];
  createdCategories: number;
  createdPaymentMethods: number;
  /** Categorías y métodos que se restauraron. */
  restored: number;
}

/** Qué pasa con un método de pago del archivo. `existing`: existe y está activo. */
type MethodPlan =
  | { kind: 'existing' | 'use' | 'restore'; id: string; currency: Currency | null }
  | { kind: 'create'; decision: Extract<PaymentMethodDecision, { action: 'create' }> };

/** Qué pasa con una categoría del archivo que falta o está archivada. */
type CategoryPlan = { kind: 'use'; id: string } | { kind: 'create' | 'restore' };

/**
 * Confirma una importación (tarea 07b): el mismo archivo de la vista previa y las decisiones
 * sobre lo que falta. Entra **todo o nada**.
 *
 * 1. **Valida todo antes de escribir nada:** que no haya filas con problemas, que cada categoría
 *    o método que falta o está archivado tenga una decisión válida, y las monedas de cada
 *    transferencia con sus cuentas finales. Si algo falla, 422 y no cambió nada.
 * 2. **Aplica el catálogo** por su API pública: restaura, luego crea (la madre antes que la hija).
 * 3. **Guarda todas las filas en una sola transacción de la base**, con su huella; si otra
 *    importación se cruza, se deshace entera (409). Si ese paso fallara, lo creado en el
 *    catálogo queda, vacío: nunca quedan movimientos a medias.
 */
@Injectable()
export class ConfirmImport {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReader,
    @Inject(CATALOG_WRITER) private readonly catalogWriter: CatalogWriter,
    @Inject(IMPORT_WRITER) private readonly writer: ImportWriter,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ConfirmImportInput): Promise<ImportResult> {
    const { userId } = input;
    const file = readImportFile(input.csv, today(this.clock));
    if (file.problems.length > 0) throw new ImportHasProblemsError(linesOf(file.problems));

    const keys = file.rows.map((row) => importKeyOf(row.fingerprint));
    const imported = new Set([
      ...(await this.transactions.importedKeys(userId, keys)),
      ...(await this.transfers.importedKeys(userId, keys)),
    ]);
    const pending = file.rows
      .map((row, index) => ({ ...row, key: keys[index] ?? '' }))
      .filter((row) => !imported.has(row.key));

    const plan = new ImportPlan(
      userId,
      this.catalog,
      new AccountNames(
        await this.catalog.allCategories(userId),
        await this.catalog.allPaymentMethods(userId),
      ),
      input,
    );
    const problems: RowProblem[] = [];
    for (const { row } of pending) {
      problems.push(...lengthProblems(row));
      if (row.kind === 'transaction') await plan.transaction(row);
      else problems.push(...(await plan.transfer(row)));
    }
    if (problems.length > 0) throw new ImportHasProblemsError(linesOf(problems));

    const applied = await plan.apply(this.catalogWriter);
    const transactions: NewTransaction[] = [];
    const transfers: NewTransfer[] = [];
    for (const { row, key } of pending) {
      if (row.kind === 'transaction') transactions.push(applied.transaction(row, key));
      else transfers.push(applied.transfer(row, key));
    }
    const { transactionIds, transferIds } = await this.writer.write(userId, {
      transactions,
      transfers,
    });
    await this.announce(userId, transactionIds, transferIds);

    return {
      transactions: transactionIds.length,
      transfers: transferIds.length,
      alreadyImported: file.rows
        .filter((_, index) => imported.has(keys[index] ?? ''))
        .map(({ row }) => row.line),
      ...applied.counts,
    };
  }

  /** Después de guardar (ADR-0004): el presupuesto se enterará de cada una, como a mano. */
  private async announce(
    userId: string,
    transactionIds: readonly string[],
    transferIds: readonly string[],
  ): Promise<void> {
    for (const transactionId of transactionIds) {
      const event: TransactionCreated = { userId, transactionId };
      await this.events.publish(TRANSACTION_CREATED, event);
    }
    for (const transferId of transferIds) {
      const event: TransferCreated = { userId, transferId };
      await this.events.publish(TRANSFER_CREATED, event);
    }
  }
}

/** Cuántas filas distintas tienen problemas. */
function linesOf(problems: readonly RowProblem[]): number {
  return new Set(problems.map((item) => item.line)).size;
}

/**
 * Lo que la importación hará con cada categoría y método del archivo. Se arma validando, sin
 * escribir; `apply` recién escribe en el catálogo.
 */
class ImportPlan {
  private readonly categoryDecisions: Map<string, CategoryDecision>;
  private readonly methodDecisions: Map<string, PaymentMethodDecision>;
  private readonly categories = new Map<string, CategoryPlan>();
  private readonly methods = new Map<string, MethodPlan>();

  constructor(
    private readonly userId: string,
    private readonly catalog: CatalogReader,
    private readonly names: AccountNames,
    input: ConfirmImportInput,
  ) {
    this.categoryDecisions = new Map(input.categories.map((d) => [categoryKey(d), d]));
    this.methodDecisions = new Map(input.paymentMethods.map((d) => [searchKey(d.alias), d]));
  }

  async transaction(row: ImportedTransaction): Promise<void> {
    const unresolved = this.names.category(row);
    if (unresolved !== null && !this.categories.has(unresolved.key)) {
      this.categories.set(unresolved.key, await this.categoryPlan(row, unresolved.entry.status));
    }
    if (row.paymentMethod !== null) await this.method(row.paymentMethod);
  }

  /** Planea sus dos cuentas y juzga la transferencia con ellas, como una manual. */
  async transfer(row: ImportedTransfer): Promise<RowProblem[]> {
    if (searchKey(row.from) === searchKey(row.to)) {
      return [
        problem(
          row,
          'destino',
          'TRANSFER_SAME_ACCOUNT',
          'Origin and destination are the same account.',
        ),
      ];
    }
    const from = await this.method(row.from);
    const to = await this.method(row.to);
    if (identity(row.from, from) === identity(row.to, to)) {
      return [
        problem(
          row,
          'destino',
          'TRANSFER_SAME_ACCOUNT',
          'Origin and destination are the same account.',
        ),
      ];
    }
    try {
      transferAmounts(row, currencyOf(from), currencyOf(to));

      return [];
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;

      return [
        problem(
          row,
          error.code === 'TRANSFER_CURRENCY_MISMATCH' ? 'moneda' : 'monto_destino',
          error.code,
          error.message,
        ),
      ];
    }
  }

  /** Escribe en el catálogo y devuelve con qué ids armar cada fila. */
  async apply(writer: CatalogWriter): Promise<AppliedPlan> {
    const counts = { createdCategories: 0, createdPaymentMethods: 0, restored: 0 };
    const methodIds = new Map<string, string>();
    for (const [key, plan] of this.methods) {
      if (plan.kind === 'create') {
        const { alias, kind, institution, last4, currency } = plan.decision;
        const id = await writer.createPaymentMethod(this.userId, {
          alias,
          kind,
          institution: institution ?? null,
          last4: last4 ?? null,
          currency: currency ?? null,
        });
        counts.createdPaymentMethods += 1;
        methodIds.set(key, id);
      } else {
        if (plan.kind === 'restore') {
          await writer.restorePaymentMethod(this.userId, plan.id);
          counts.restored += 1;
        }
        methodIds.set(key, plan.id);
      }
    }

    const categoryIds = new Map<string, string>();
    const parents = new Map<string, string>();
    for (const [key, plan] of this.categories) {
      if (plan.kind === 'use') {
        categoryIds.set(key, plan.id);
        continue;
      }
      const decision = this.categoryDecisions.get(key);
      if (decision === undefined) throw new Error(`No decision for ${key}`);
      categoryIds.set(key, await this.createOrRestore(writer, decision, parents, counts));
    }

    const currencies = new Map([...this.methods].map(([key, plan]) => [key, currencyOf(plan)]));

    return new AppliedPlan(this.userId, this.names, methodIds, currencies, categoryIds, counts);
  }

  /**
   * Deja la categoría (y su madre) existentes y activas: restaura lo archivado y crea lo que
   * falta, cada madre una sola vez aunque varias filas la compartan.
   */
  private async createOrRestore(
    writer: CatalogWriter,
    decision: CategoryDecision,
    parents: Map<string, string>,
    counts: { createdCategories: number; restored: number },
  ): Promise<string> {
    const parentKey = `${decision.type}/${searchKey(decision.category)}`;
    let parentId = parents.get(parentKey);
    if (parentId === undefined) {
      const parent = this.names.topLevelCategory(decision.type, decision.category);
      if (parent === undefined) {
        parentId = await writer.createCategory(this.userId, {
          type: decision.type,
          name: decision.category,
          parentId: null,
        });
        counts.createdCategories += 1;
      } else {
        if (parent.archived) {
          await writer.restoreCategory(this.userId, parent.id);
          counts.restored += 1;
        }
        parentId = parent.id;
      }
      parents.set(parentKey, parentId);
    }
    if (decision.subcategory === null) return parentId;

    const child = this.names.childCategory(parentId, decision.subcategory);
    if (child === undefined) {
      counts.createdCategories += 1;

      return writer.createCategory(this.userId, {
        type: decision.type,
        name: decision.subcategory,
        parentId,
      });
    }
    // Restaurar a la madre pudo devolverla ya; restaurar lo activo no cambia nada.
    if (child.archived) {
      await writer.restoreCategory(this.userId, child.id);
      counts.restored += 1;
    }

    return child.id;
  }

  private async categoryPlan(row: ImportedTransaction, status: Unresolved): Promise<CategoryPlan> {
    const key = categoryKey(row);
    const what = `the category "${[row.category, row.subcategory].filter(Boolean).join(' > ')}"`;
    const decision = this.categoryDecisions.get(key);
    if (decision === undefined) throw new ImportUnresolvedError(what);

    switch (decision.action) {
      case 'create':
        if (status !== 'missing') {
          throw new ImportDecisionInvalidError(
            what,
            'it exists archived: restore it or use another',
          );
        }

        return { kind: 'create' };
      case 'restore':
        if (status !== 'archived') {
          throw new ImportDecisionInvalidError(what, 'it does not exist: create it or use another');
        }

        return { kind: 'restore' };
      case 'use': {
        const target = await this.catalog.category(this.userId, decision.categoryId);
        if (target === null || target.archived || target.type !== row.type) {
          throw new ImportDecisionInvalidError(
            what,
            'the category to use must be yours, active and of the same type',
          );
        }

        return { kind: 'use', id: decision.categoryId };
      }
    }
  }

  /** El plan de un método, una sola vez por alias. */
  private async method(alias: string): Promise<MethodPlan> {
    const key = searchKey(alias);
    const planned = this.methods.get(key);
    if (planned !== undefined) return planned;

    const existing = this.names.method(alias);
    const plan =
      existing !== undefined && !existing.archived
        ? { kind: 'existing' as const, id: existing.id, currency: existing.currency }
        : await this.methodPlan(alias, existing === undefined ? 'missing' : 'archived');
    this.methods.set(key, plan);

    return plan;
  }

  private async methodPlan(alias: string, status: Unresolved): Promise<MethodPlan> {
    const what = `the payment method "${alias}"`;
    const decision = this.methodDecisions.get(searchKey(alias));
    if (decision === undefined) throw new ImportUnresolvedError(what);

    switch (decision.action) {
      case 'create':
        if (status !== 'missing') {
          throw new ImportDecisionInvalidError(
            what,
            'it exists archived: restore it or use another',
          );
        }
        // Las mismas reglas que al crearlo a mano, antes de crear nada.
        assertValidPaymentMethod({
          kind: decision.kind,
          institution: decision.institution ?? null,
          last4: decision.last4 ?? null,
          currency: decision.currency ?? null,
        });

        return { kind: 'create', decision };
      case 'restore': {
        const archived = this.names.method(alias);
        if (status !== 'archived' || archived === undefined) {
          throw new ImportDecisionInvalidError(what, 'it does not exist: create it or use another');
        }

        return { kind: 'restore', id: archived.id, currency: archived.currency };
      }
      case 'use': {
        const target = await this.catalog.paymentMethod(this.userId, decision.paymentMethodId);
        if (target === null || target.archived) {
          throw new ImportDecisionInvalidError(
            what,
            'the payment method to use must be yours and active',
          );
        }

        return { kind: 'use', id: decision.paymentMethodId, currency: target.currency };
      }
    }
  }
}

/** Con el catálogo ya aplicado: los ids con que se arma cada fila. */
class AppliedPlan {
  constructor(
    private readonly userId: string,
    private readonly names: AccountNames,
    private readonly methodIds: ReadonlyMap<string, string>,
    /** La moneda final de cada cuenta, también de las recién creadas. */
    private readonly currencies: ReadonlyMap<string, Currency | null>,
    private readonly categoryIds: ReadonlyMap<string, string>,
    readonly counts: { createdCategories: number; createdPaymentMethods: number; restored: number },
  ) {}

  transaction(row: ImportedTransaction, importKey: string): NewTransaction {
    return {
      userId: this.userId,
      date: row.date,
      type: row.type,
      categoryId: this.categoryId(row),
      amount: row.amount,
      description: row.description,
      paymentMethodId: row.paymentMethod === null ? null : this.methodId(row.paymentMethod),
      merchant: row.merchant,
      source: 'IMPORT',
      tags: row.tags,
      importKey,
    };
  }

  transfer(row: ImportedTransfer, importKey: string): NewTransfer {
    // Ya validado con las monedas de sus cuentas: aquí solo se arman los dos montos.
    const { sent, received } = transferAmounts(
      row,
      this.currencies.get(searchKey(row.from)) ?? null,
      this.currencies.get(searchKey(row.to)) ?? null,
    );

    return {
      userId: this.userId,
      date: row.date,
      fromPaymentMethodId: this.methodId(row.from),
      toPaymentMethodId: this.methodId(row.to),
      amount: sent,
      receivedAmount: received,
      description: row.description,
      source: 'IMPORT',
      importKey,
    };
  }

  private categoryId(row: ImportedTransaction): string {
    const planned = this.categoryIds.get(categoryKey(row));
    if (planned !== undefined) return planned;
    // Si no se planeó, existe y está activa.
    const parent = this.names.topLevelCategory(row.type, row.category);
    const found =
      row.subcategory === null || parent === undefined
        ? parent
        : this.names.childCategory(parent.id, row.subcategory);
    if (found === undefined) throw new Error(`No category for line ${String(row.line)}`);

    return found.id;
  }

  private methodId(alias: string): string {
    const id = this.methodIds.get(searchKey(alias));
    if (id === undefined) throw new Error(`No payment method for ${alias}`);

    return id;
  }
}

function currencyOf(plan: MethodPlan): Currency | null {
  return plan.kind === 'create' ? (plan.decision.currency ?? null) : plan.currency;
}

/** Quién es la cuenta al final: dos alias pueden terminar en la misma cuenta con `use`. */
function identity(alias: string, plan: MethodPlan): string {
  return plan.kind === 'create' ? `new/${searchKey(alias)}` : plan.id;
}

function transferAmounts(
  row: ImportedTransfer,
  fromCurrency: Currency | null,
  toCurrency: Currency | null,
) {
  return resolveTransferAmounts(
    {
      amount: row.amount.toFixed(),
      currency: row.amount.currency,
      receivedAmount: row.receivedAmount,
      receivedCurrency: null,
    },
    { currency: fromCurrency },
    { currency: toCurrency },
  );
}
