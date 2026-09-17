import { InvalidInstantError, LocalDate } from './local-date.js';

/** Zona horaria del negocio: toda fecha de negocio se calcula en la hora de Lima. */
export const PERU_TIME_ZONE = 'America/Lima';

/**
 * Puerto para leer el instante actual.
 *
 * La lógica de dominio **nunca** llama a `new Date()`: recibe un `Clock`. Así una prueba puede
 * fijar el "hoy" y los cálculos (días hasta el pago, ciclo de facturación) son reproducibles.
 * La implementación real vive en la infraestructura; aquí solo está el doble para pruebas.
 */
export interface Clock {
  now(): Date;
}

/** Reloj detenido en un instante, para pruebas y escenarios BDD. */
export class FixedClock implements Clock {
  private constructor(private readonly instant: Date) {}

  static at(instant: string | Date): FixedClock {
    const value = instant instanceof Date ? new Date(instant.getTime()) : new Date(instant);
    if (Number.isNaN(value.getTime())) {
      throw new InvalidInstantError(instant);
    }
    return new FixedClock(value);
  }

  /** Copia defensiva: `Date` es mutable y nadie debería poder mover el reloj. */
  now(): Date {
    return new Date(this.instant.getTime());
  }
}

/** Fecha de negocio de hoy según el reloj, en la hora de Lima salvo que se indique otra zona. */
export function today(clock: Clock, timeZone: string = PERU_TIME_ZONE): LocalDate {
  return LocalDate.fromInstant(clock.now(), timeZone);
}
