import type { NewTransaction } from './transaction-repository.js';
import type { NewTransfer } from './transfer-repository.js';

/**
 * Guarda una importación **entera o nada**: las transacciones (con sus etiquetas) y las
 * transferencias, en una sola transacción de la base. Cada fila trae su `importKey`.
 */
export interface ImportWriter {
  /**
   * Devuelve los ids en el orden recibido. Lanza `ImportConflictError` (y no guarda nada) si
   * alguna huella ya existe: otra importación del mismo archivo se cruzó con esta.
   */
  write(
    userId: string,
    rows: { transactions: readonly NewTransaction[]; transfers: readonly NewTransfer[] },
  ): Promise<{ transactionIds: string[]; transferIds: string[] }>;
}

export const IMPORT_WRITER = Symbol('ImportWriter');
