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

/**
 * La cuenta tiene segundo factor y la petición no trajo código.
 *
 * Confirma que la contraseña era correcta, y eso es inevitable: sin decirlo no habría forma de
 * pedir el código. Es justamente la razón de ser del segundo factor — que saber la contraseña
 * ya no baste.
 */
export class TotpRequiredError extends DomainError {
  readonly code = 'TOTP_REQUIRED';

  constructor() {
    super('This account needs a second factor code.');
  }
}

/** El código no corresponde, caducó, o ya se usó. No se dice cuál de las tres. */
export class InvalidTotpCodeError extends DomainError {
  readonly code = 'INVALID_TOTP_CODE';

  constructor() {
    super('That second factor code is not valid.');
  }
}

/** Se intentó activar el segundo factor en una cuenta que ya lo tiene. */
export class TotpAlreadyEnabledError extends DomainError {
  readonly code = 'TOTP_ALREADY_ENABLED';

  constructor() {
    super('The second factor is already enabled. Disable it first.');
  }
}

/** Se intentó confirmar o desactivar un segundo factor que no está en marcha. */
export class TotpNotStartedError extends DomainError {
  readonly code = 'TOTP_NOT_STARTED';

  constructor() {
    super('There is no second factor to confirm. Start the setup first.');
  }
}
