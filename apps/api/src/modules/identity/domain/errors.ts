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
