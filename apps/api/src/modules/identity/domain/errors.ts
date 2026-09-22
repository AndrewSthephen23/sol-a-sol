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

/**
 * Al cambiar la contraseña, la actual no corresponde.
 *
 * 403 y no 401: la sesión es válida y la web no debe cerrarla; lo que falla es la prueba extra
 * que se pide antes de un cambio sensible, para que quien pille una sesión abierta un momento
 * no pueda quedarse con la cuenta.
 */
export class CurrentPasswordIncorrectError extends DomainError {
  readonly code = 'CURRENT_PASSWORD_INCORRECT';

  constructor() {
    super('The current password is not correct.');
  }
}

/**
 * El token personal no vale: no tiene la forma esperada, no existe, el secreto no coincide,
 * caducó o se revocó. Un solo error para todos los casos, como con el refresco: decir cuál fue
 * le diría a quien encontró un token si va por buen camino.
 */
export class InvalidPersonalAccessTokenError extends DomainError {
  readonly code = 'INVALID_PERSONAL_ACCESS_TOKEN';

  constructor() {
    super('The personal access token is not valid, has expired or was revoked.');
  }
}

/**
 * El token personal es válido, pero sus scopes no alcanzan para esa ruta. Por ejemplo, el token
 * del celular (`captures:write`) intentando listar los tokens o tocar el segundo factor.
 */
export class InsufficientTokenScopeError extends DomainError {
  readonly code = 'INSUFFICIENT_TOKEN_SCOPE';

  constructor() {
    super('This personal access token is not allowed to do that.');
  }
}

/** No existe **o es de otra cuenta**: responder distinto confirmaría que el id es de alguien. */
export class PersonalAccessTokenNotFoundError extends DomainError {
  readonly code = 'PERSONAL_ACCESS_TOKEN_NOT_FOUND';

  constructor() {
    super('There is no personal access token with that id.');
  }
}
