import { type Currency } from '../currency/currency.js';

/**
 * El monto de una captura. **Puede ir sin moneda** (decisión 3 de H7): la de un método bimoneda
 * o no reconocido se elige en la bandeja, y nunca se suponen soles. Por eso no es un `Money`.
 *
 * `value` va con 2 decimales (`"25.90"`), como lo guarda la base, y es mayor que cero.
 */
export interface CaptureAmount {
  value: string;
  currency: Currency | null;
}

/**
 * Códigos estables de lo que el dominio encontró al leer una captura. Se suman a los del parser
 * de la notificación (`@sol-a-sol/capture-parsers`) en `captures.warnings`.
 */
export type CaptureDomainWarning =
  /** El monto del campo no se puede leer, no es mayor que cero o tiene más de 2 decimales. */
  | 'INVALID_AMOUNT'
  /** El campo y la notificación dicen montos distintos: manda el campo (decisión 2). */
  | 'AMOUNT_MISMATCH'
  /** El instante cae en un día futuro: queda en hoy (decisión 5). */
  | 'FUTURE_DATE'
  /** Pasó hace más de 30 días (decisión 5). */
  | 'OLD_DATE'
  /** El monto dice una moneda y el método reconocido tiene otra (decidido el 2026-10-04). */
  | 'CURRENCY_MISMATCH';
