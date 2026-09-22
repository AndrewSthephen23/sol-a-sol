/** Lo que se puede mostrar de un token: todo menos su valor, que no se guarda. */
export interface PersonalAccessTokenSummary {
  id: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
}

/** Lo que hace falta para autenticar una petición con el token. */
export interface StoredPersonalAccessToken {
  id: string;
  userId: string;
  tokenHash: string;
  scopes: string[];
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewPersonalAccessToken {
  userId: string;
  name: string;
  tokenHash: string;
  scopes: string[];
  expiresAt: Date;
}

/**
 * Todo método que lee o cambia tokens de una cuenta **exige su `userId`**: no existe forma de
 * listar o revocar un token sin decir de quién es, así que olvidar el filtro no compila.
 *
 * La única excepción es `findForAuthentication`, y es inevitable: es justo el paso que averigua
 * de quién es la petición.
 */
export interface PersonalAccessTokenRepository {
  create(token: NewPersonalAccessToken): Promise<PersonalAccessTokenSummary>;

  /** Los que no se revocaron, del más nuevo al más viejo. Los caducados siguen en la lista. */
  listActive(userId: string): Promise<PersonalAccessTokenSummary[]>;

  /**
   * `false` si no existe, **es de otra cuenta** o ya estaba revocado: desde fuera, las tres
   * cosas son lo mismo.
   */
  revoke(userId: string, id: string, revokedAt: Date): Promise<boolean>;

  findForAuthentication(id: string): Promise<StoredPersonalAccessToken | null>;

  recordUse(id: string, usedAt: Date): Promise<void>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const PERSONAL_ACCESS_TOKEN_REPOSITORY = Symbol('PersonalAccessTokenRepository');
