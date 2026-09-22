export interface StoredRefreshToken {
  id: string;
  userId: string;
  expiresAt: Date;
  /** Cuándo se canjeó. Si no es `null` y vuelve a llegar, alguien copió el token. */
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;

  /** Lo marca como canjeado. Devuelve `false` si otra petición se le adelantó. */
  markUsed(id: string, usedAt: Date): Promise<boolean>;

  revoke(id: string, revokedAt: Date): Promise<void>;

  /**
   * Cierra **todas** las sesiones del usuario (la respuesta a un token reusado), salvo la del
   * hash `exceptTokenHash` si se indica: la que acaba de cambiar la contraseña o activar el
   * segundo factor no tiene por qué volver a entrar.
   */
  revokeAllForUser(userId: string, revokedAt: Date, exceptTokenHash?: string): Promise<number>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const REFRESH_TOKEN_REPOSITORY = Symbol('RefreshTokenRepository');
