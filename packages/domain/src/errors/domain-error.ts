/**
 * Error de una regla de negocio.
 *
 * `code` es estable y en inglés: las capas externas lo traducen (por ejemplo, a Problem Details
 * en la API o a un mensaje en español en la web). El `message` es para logs y depuración.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
