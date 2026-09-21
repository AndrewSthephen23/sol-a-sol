import { DomainError } from '../errors/domain-error.js';

import { COMMON_PASSWORDS } from './common-passwords.js';

/**
 * Mínimo de caracteres de una contraseña.
 *
 * Doce, y sin exigir mayúsculas, números ni símbolos: es el criterio de NIST SP 800-63B. Lo que
 * aporta seguridad real es la longitud; las reglas de composición empujan a patrones previsibles
 * (`Password1!`) y a apuntar la contraseña en un papel.
 */
export const PASSWORD_MIN_LENGTH = 12;

/** Una contraseña que la política rechaza. Permite atrapar los dos motivos a la vez. */
export abstract class WeakPasswordError extends DomainError {}

export class PasswordTooShortError extends WeakPasswordError {
  readonly code = 'PASSWORD_TOO_SHORT';

  constructor() {
    // Decir el mínimo ayuda a quien escribe y no revela nada que el atacante no supiera.
    super(`The password must be at least ${String(PASSWORD_MIN_LENGTH)} characters long.`);
  }
}

export class PasswordTooCommonError extends WeakPasswordError {
  readonly code = 'PASSWORD_TOO_COMMON';

  constructor() {
    // A propósito no dice de dónde sale ni qué la hace común: sería decirle al atacante
    // qué evitar. Tampoco incluye la contraseña, que acabaría en un log.
    super('The password is too easy to guess. Choose a different one.');
  }
}

const BLOCKED = new Set(COMMON_PASSWORDS);

/**
 * Cuenta caracteres tal como los ve quien escribe, no unidades de almacenamiento.
 *
 * Un emoji de familia ocupa 8 unidades UTF-16 y 5 puntos de código, pero es **un** carácter. Sin
 * esto, tres emojis de familia sumarían 15 y pasarían un mínimo de 12 siendo tres caracteres.
 */
function lengthInCharacters(text: string): number {
  // La locale va fija: sin ella se usaría la del entorno y el dominio dejaría de ser
  // determinista. Para agrupar grafemas da igual cuál sea, porque la regla de Unicode no
  // cambia entre idiomas. Se construye aquí y no en una constante del módulo para que el
  // mutation testing pueda alcanzarla: lo que se evalúa al importar queda fuera de su alcance.
  //
  // Stryker disable next-line ObjectLiteral: 'grapheme' ya es el valor por defecto, así que
  // quitarlo no cambia el comportamiento; se deja escrito porque es lo que hace que la regla
  // cuente caracteres y no unidades de almacenamiento.
  const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

  return [...graphemes.segment(text)].length;
}

/**
 * Comprueba que una contraseña cumpla la política. No la devuelve ni la transforma: la
 * contraseña se usa tal como se escribió, espacios incluidos.
 *
 * @throws {PasswordTooShortError} si no llega al mínimo.
 * @throws {PasswordTooCommonError} si está entre las contraseñas previsibles.
 */
export function assertPasswordIsStrong(password: string): void {
  if (lengthInCharacters(password) < PASSWORD_MIN_LENGTH) throw new PasswordTooShortError();
  if (BLOCKED.has(password.toLowerCase())) throw new PasswordTooCommonError();
}
