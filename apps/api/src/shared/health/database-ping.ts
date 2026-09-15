/**
 * Puerto de salud de la base de datos. La readiness depende de esta abstracción,
 * no de Prisma, para poder probarla sin una base de datos real.
 */
export abstract class DatabasePing {
  /** Resuelve si la base de datos responde; rechaza en caso contrario. */
  abstract ping(): Promise<void>;
}
