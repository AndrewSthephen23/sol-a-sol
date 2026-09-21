export interface AccessToken {
  token: string;
  /** Segundos que le quedan de vida al emitirlo, para que el cliente sepa cuándo renovarlo. */
  expiresInSeconds: number;
}

/** Emite el token de acceso que viaja en cada petición. */
export interface AccessTokenIssuer {
  issue(userId: string): Promise<AccessToken>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const ACCESS_TOKEN_ISSUER = Symbol('AccessTokenIssuer');
