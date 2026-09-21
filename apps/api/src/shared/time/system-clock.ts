import { Injectable } from '@nestjs/common';
import type { Clock } from '@sol-a-sol/domain';

/**
 * El único sitio de la API donde se lee la hora real.
 *
 * El dominio recibe siempre un `Clock` y nunca llama a `new Date()`, así que una prueba puede
 * detener el tiempo con `FixedClock` y comprobar caducidades exactas.
 */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Token de inyección: en TypeScript una interfaz no existe en tiempo de ejecución. */
export const CLOCK = Symbol('Clock');
