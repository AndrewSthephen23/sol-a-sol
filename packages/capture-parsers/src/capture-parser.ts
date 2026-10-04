import { type Money } from '@sol-a-sol/domain';

/** De qué fuente se entendió una notificación. `GENERIC`: de ninguna conocida. */
export type CaptureParserSource = 'YAPE' | 'BCP' | 'INTERBANK' | 'LEMON' | 'PLIN' | 'GENERIC';

/**
 * Qué fue la operación: un gasto (por defecto) o un ingreso, como un «te yapearon» o un abono
 * (decisión 8 de H7). Una operación rechazada no es otro tipo: es un gasto o un ingreso con el
 * aviso `OPERATION_REJECTED`, y entra a la bandeja marcada.
 */
export type CaptureKind = 'EXPENSE' | 'INCOME';

/**
 * Códigos estables de lo que no se entendió o hay que mirar. Viajan en la captura (`warnings`) y
 * la web los traduce, como los `code` de los errores.
 */
export type CaptureWarning =
  /** Ninguna fuente conocida reconoció el texto: se leyó solo el monto, como gasto. */
  | 'UNKNOWN_SOURCE'
  /** El parser de la fuente falló con este texto (quizás cambió el formato): lectura genérica. */
  | 'PARSER_FAILED'
  /** No hay ningún monto pegado a una moneda. */
  | 'AMOUNT_NOT_FOUND'
  /** Hay montos distintos y no se elige uno. */
  | 'AMBIGUOUS_AMOUNT'
  /** El monto no se puede leer, por ejemplo con más de 2 decimales. */
  | 'INVALID_AMOUNT'
  /** El texto traía un número de tarjeta completo; se guardan solo sus últimos 4. */
  | 'CARD_NUMBER_MASKED'
  /** El banco rechazó la operación. */
  | 'OPERATION_REJECTED';

/** Lo que un parser entendió de una notificación. Lo que no entendió queda en `null`. */
export interface ParsedCapture {
  source: CaptureParserSource;
  kind: CaptureKind;
  amount: Money | null;
  merchant: string | null;
  cardLast4: string | null;
  warnings: CaptureWarning[];
}

/**
 * El lector de las notificaciones de una fuente. Agregar un banco es escribir uno de estos, con
 * sus fixtures, y registrarlo en `PARSERS`.
 *
 * Recibe el texto con los números de tarjeta ya enmascarados.
 */
export interface CaptureParser {
  source: Exclude<CaptureParserSource, 'GENERIC'>;
  /** ¿Es una notificación de esta fuente? */
  matches(text: string): boolean;
  parse(text: string): ParsedCapture;
}
