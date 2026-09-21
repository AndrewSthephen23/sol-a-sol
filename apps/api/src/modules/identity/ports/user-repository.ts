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

export interface UserRepository {
  /** Si existe alguna cuenta. Es lo que decide el registro en modo `closed`. */
  hasAnyUser(): Promise<boolean>;

  /**
   * @throws {EmailAlreadyRegisteredError} si el correo ya está tomado. Se apoya en la
   * restricción única de la base, no en una consulta previa: comprobar y luego insertar deja
   * una ventana en la que dos peticiones simultáneas pasan las dos.
   */
  create(user: NewUser): Promise<UserAccount>;
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const USER_REPOSITORY = Symbol('UserRepository');
