export interface AccessToken {
  token: string;
  /** Segundos que le quedan de vida al emitirlo, para que el cliente sepa cuándo renovarlo. */
  expiresInSeconds: number;
}

/** Emite y comprueba el token de acceso que viaja en cada petición. */
export interface AccessTokens {
  issue(userId: string): Promise<AccessToken>;

  /** El `userId` del token, o `null` si no vale: mal firmado, manipulado o caducado. */
  verify(token: string): Promise<string | null>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const ACCESS_TOKENS = Symbol('AccessTokens');
