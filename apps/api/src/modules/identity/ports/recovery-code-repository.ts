export interface StoredRecoveryCode {
  id: string;
  userId: string;
}

export interface RecoveryCodeRepository {
  /** Guarda un juego nuevo y **borra el anterior**: los códigos viejos dejan de valer. */
  replaceAll(userId: string, codeHashes: string[]): Promise<void>;

  /** Busca un código sin usar de esa cuenta. `null` si no existe o ya se gastó. */
  findUnused(userId: string, codeHash: string): Promise<StoredRecoveryCode | null>;

  /** Lo marca como gastado. `false` si otra petición se le adelantó. */
  markUsed(id: string, usedAt: Date): Promise<boolean>;

  countUnused(userId: string): Promise<number>;

  deleteAllForUser(userId: string): Promise<void>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const RECOVERY_CODE_REPOSITORY = Symbol('RecoveryCodeRepository');
