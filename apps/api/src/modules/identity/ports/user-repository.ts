/** Datos de una cuenta que se pueden devolver. Nunca incluye el hash ni el secreto TOTP. */
export interface UserAccount {
  id: string;
  email: string;
  createdAt: Date;
}

export interface NewUser {
  email: string;
  passwordHash: string;
}

/**
 * Lo mínimo para comprobar un inicio de sesión. Tiene su propio tipo, y no se mezcla con
 * `UserAccount`, para que el hash solo salga del repositorio cuando alguien lo pide a propósito.
 */
export interface UserCredentials {
  id: string;
  email: string;
  passwordHash: string;
  /** Cifrado. Existe desde que se empieza a activar el segundo factor. */
  totpSecret: string | null;
  /** Nulo mientras el segundo factor no esté confirmado con un código. */
  totpConfirmedAt: Date | null;
  /** Último periodo de 30 s usado, para que un código no sirva dos veces. */
  totpLastCounter: bigint | null;
}

export interface UserRepository {
  /** Si existe alguna cuenta. Es lo que decide el registro en modo `closed`. */
  hasAnyUser(): Promise<boolean>;

  /** Ids de todas las cuentas, de la más vieja a la más nueva. Nada más: ni correo ni hash. */
  listIds(): Promise<string[]>;

  /** `null` si no hay cuenta con ese correo. Quien llama no debe delatar la diferencia. */
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>;

  /**
   * @throws {EmailAlreadyRegisteredError} si el correo ya está tomado. Se apoya en la
   * restricción única de la base, no en una consulta previa: comprobar y luego insertar deja
   * una ventana en la que dos peticiones simultáneas pasan las dos.
   */
  create(user: NewUser): Promise<UserAccount>;

  findCredentialsById(userId: string): Promise<UserCredentials | null>;

  /** Guarda el secreto cifrado y deja el segundo factor **sin confirmar**. */
  startTotpEnrolment(userId: string, encryptedSecret: string): Promise<void>;

  /** Da el segundo factor por activo y anota el periodo usado. */
  confirmTotp(userId: string, confirmedAt: Date, counter: number): Promise<void>;

  /** Anota el periodo usado en un login, para que ese código no valga otra vez. */
  recordTotpCounter(userId: string, counter: number): Promise<void>;

  /** Borra el secreto y deja la cuenta sin segundo factor. */
  disableTotp(userId: string): Promise<void>;

  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const USER_REPOSITORY = Symbol('UserRepository');
