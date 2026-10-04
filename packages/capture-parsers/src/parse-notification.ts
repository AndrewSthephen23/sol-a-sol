import { type CaptureParser, type CaptureWarning, type ParsedCapture } from './capture-parser.js';
import { maskCardNumbers } from './mask-card-numbers.js';
import { PARSERS } from './parsers.js';
import { readAmount } from './read-amount.js';

/** Lo entendido, con el texto ya enmascarado: es el que se puede guardar. */
export interface ParsedNotification extends ParsedCapture {
  text: string;
}

/**
 * Entiende el texto de una notificación con el parser de su fuente (el primero que la
 * reconoce) o, si ninguno, con una lectura genérica: un gasto con el monto que se encuentre y
 * el aviso `UNKNOWN_SOURCE`.
 *
 * **Nunca lanza:** la captura se guarda siempre, entienda o no. Un parser que falla cae a la
 * lectura genérica con `PARSER_FAILED`. Antes de todo se tapan los números de tarjeta.
 */
export function parseNotification(
  text: string,
  parsers: readonly CaptureParser[] = PARSERS,
): ParsedNotification {
  const masked = maskCardNumbers(text);
  const failures: CaptureWarning[] = [];

  const parsed = fromParsers(masked.text, parsers, failures) ?? generic(masked.text);
  const warnings = [...failures, ...parsed.warnings];
  if (masked.masked) {
    warnings.push('CARD_NUMBER_MASKED');
  }

  return {
    ...parsed,
    cardLast4: parsed.cardLast4 ?? masked.last4,
    warnings,
    text: masked.text,
  };
}

function fromParsers(
  text: string,
  parsers: readonly CaptureParser[],
  failures: CaptureWarning[],
): ParsedCapture | null {
  const parser = parsers.find((candidate) => recognizes(candidate, text, failures));
  if (parser === undefined) {
    return null;
  }
  try {
    return parser.parse(text);
  } catch {
    failures.push('PARSER_FAILED');
    return null;
  }
}

/** Un parser que falla al reconocer se salta: quizás el siguiente sí entiende el texto. */
function recognizes(parser: CaptureParser, text: string, failures: CaptureWarning[]): boolean {
  try {
    return parser.matches(text);
  } catch {
    failures.push('PARSER_FAILED');
    return false;
  }
}

function generic(text: string): ParsedCapture {
  const { amount, warnings } = readAmount(text);
  return {
    source: 'GENERIC',
    kind: 'EXPENSE',
    amount,
    merchant: null,
    cardLast4: null,
    warnings: ['UNKNOWN_SOURCE', ...warnings],
  };
}
