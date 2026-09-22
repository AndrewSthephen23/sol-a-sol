/**
 * Borrado de entradas viejas de la bitácora.
 *
 * Va en un puerto aparte del `AuditLogger` a propósito: quien registra un hecho no tiene por qué
 * poder borrar la evidencia, y así ningún caso de uso recibe esa capacidad sin pedirla.
 */
export interface AuditLogCleaner {
  /** Borra las entradas anteriores a ese instante. Devuelve cuántas. */
  deleteOlderThan(instant: Date): Promise<number>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const AUDIT_LOG_CLEANER = Symbol('AuditLogCleaner');
