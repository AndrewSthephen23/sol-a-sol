import {
  AmbiguousAmountError,
  AmountNotFoundError,
  findAmountInText,
  type Money,
} from '@sol-a-sol/domain';

import { type CaptureWarning } from './capture-parser.js';

export interface ReadAmount {
  amount: Money | null;
  warnings: CaptureWarning[];
}

/**
 * El monto de una notificación con `findAmountInText` (solo montos pegados a una moneda), sin
 * lanzar: si no hay, hay varios distintos o no se puede leer, `null` y el porqué.
 */
export function readAmount(text: string): ReadAmount {
  try {
    return { amount: findAmountInText(text), warnings: [] };
  } catch (error) {
    return { amount: null, warnings: [warningFor(error)] };
  }
}

function warningFor(error: unknown): CaptureWarning {
  if (error instanceof AmountNotFoundError) {
    return 'AMOUNT_NOT_FOUND';
  }
  if (error instanceof AmbiguousAmountError) {
    return 'AMBIGUOUS_AMOUNT';
  }
  return 'INVALID_AMOUNT';
}
