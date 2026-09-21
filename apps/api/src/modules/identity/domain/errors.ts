import { DomainError } from '@sol-a-sol/domain';

/**
 * Ya hay una cuenta con ese correo.
 *
 * **Revela que el correo existe**, y eso solo es aceptable porque el registro está cerrado por
 * defecto: con `REGISTRATION_MODE=closed` este error es inalcanzable, porque el guard responde
 * 404 en cuanto existe una cuenta. Si algún día se abre el registro, habrá que taparlo (lo
 * habitual es responder siempre 201 y avisar por correo, que hoy no existe).
 */
export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';

  constructor() {
    super('That email address is already registered.');
  }
}

/**
 * El correo no existe **o** la contraseña no corresponde: un solo error para los dos casos, a
 * propósito. Distinguirlos permitiría averiguar qué correos tienen cuenta probándolos uno a uno.
 *
 * Por el mismo motivo, el mensaje no dice cuál de los dos falló.
 */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Email or password is incorrect.');
  }
}

/**
 * La sesión no vale: no hay cookie, el token no existe, caducó, se revocó, o ya se había
 * canjeado. Un solo error para todos los casos: decir cuál fue le diría a quien robó un token
 * si va por buen camino.
 */
export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';

  constructor() {
    super('The session is no longer valid. Sign in again.');
  }
}
