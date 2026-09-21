export interface TotpEnrolment {
  /** Secreto en claro, en base32. Solo existe al activar; después se guarda cifrado. */
  secret: string;
  /** URI `otpauth://` que escanean Google Authenticator, Aegis, 1Password o Bitwarden. */
  uri: string;
}

export interface TotpVerification {
  /** Periodo de 30 s al que correspondía el código, para no poder reutilizarlo. */
  counter: number;
}

export interface Totp {
  /** Crea un secreto nuevo y la URI que lo acompaña. */
  enrol(accountName: string): TotpEnrolment;

  /**
   * Comprueba un código contra el secreto, aceptando un periodo a cada lado por si los relojes
   * no coinciden. Devuelve `null` si no corresponde a ninguno.
   */
  verify(secret: string, code: string): TotpVerification | null;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const TOTP = Symbol('Totp');
