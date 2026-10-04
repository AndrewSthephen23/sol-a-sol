import { parseAmount } from '../money/parse-amount.js';
import { type Money } from '../money/money.js';
import { type TransactionType } from '../transactions/transaction-policy.js';
import { type CaptureAmount, type CaptureDomainWarning } from './capture-amount.js';
import { cleanText } from './clean-text.js';

/**
 * Lo que entendió el parser de la notificación (`parseNotification` de
 * `@sol-a-sol/capture-parsers`), con la forma que el dominio necesita.
 */
export interface NotificationReading {
  kind: 'EXPENSE' | 'INCOME';
  amount: Money | null;
  merchant: string | null;
  cardLast4: string | null;
  warnings: readonly string[];
}

/** Lo que mandó el teléfono: los campos del atajo y, si vino texto, cómo se leyó. */
export interface CaptureRequest {
  amountText: string | null;
  merchant: string | null;
  card: string | null;
  notification: NotificationReading | null;
}

/** Lo que se entendió de la captura, todavía sin método de pago ni categoría. */
export interface CaptureReading {
  type: Extract<TransactionType, 'VARIABLE_EXPENSE' | 'INCOME'>;
  amount: CaptureAmount | null;
  merchant: string | null;
  cardLast4: string | null;
  /** El texto de `card`, para compararlo con el alias de los métodos (decisión 4). */
  cardText: string | null;
  warnings: string[];
}

/**
 * Un grupo de exactamente 4 dígitos: `4242`, `****4242`, `••••4242`. El 13 de `12345` no cuenta.
 */
const LAST4 = /(?<!\d)\d{4}(?!\d)/gu;

/**
 * Lee lo que mandó el teléfono (decisión 2 de H7): **mandan los campos** y el texto de la
 * notificación completa lo que falte. Si los dos traen montos distintos, queda el del campo con
 * el aviso `AMOUNT_MISMATCH`.
 *
 * **Nunca lanza:** lo que no se entiende queda en `null` con su aviso, porque la captura se
 * guarda siempre.
 */
export function readCaptureRequest(request: CaptureRequest): CaptureReading {
  const { notification } = request;
  const warnings: string[] = [...(notification?.warnings ?? [])];
  const warn = (warning: CaptureDomainWarning) => warnings.push(warning);

  const field = readAmountField(request.amountText, warn);
  const fromText = notification?.amount ?? null;
  const amount = mergeAmounts(field, fromText, warn);

  return {
    type: notification?.kind === 'INCOME' ? 'INCOME' : 'VARIABLE_EXPENSE',
    amount,
    merchant: cleanText(request.merchant) ?? cleanText(notification?.merchant ?? null),
    cardLast4: lastFourOf(request.card) ?? notification?.cardLast4 ?? null,
    cardText: cleanText(request.card),
    warnings,
  };
}

/**
 * El monto del campo. Sin moneda (`"25.90"`) se acepta y queda sin ella: se lee con una moneda
 * cualquiera solo para validar la forma, y esa moneda se descarta.
 */
function readAmountField(
  text: string | null,
  warn: (warning: CaptureDomainWarning) => void,
): CaptureAmount | null {
  const cleaned = cleanText(text);
  if (cleaned === null) return null;
  const amount = readAmountText(cleaned);
  if (amount === null) warn('INVALID_AMOUNT');
  return amount;
}

function readAmountText(text: string): CaptureAmount | null {
  try {
    return positive(parseAmount(text), true);
  } catch {
    try {
      return positive(parseAmount(text, { defaultCurrency: 'PEN' }), false);
    } catch {
      return null;
    }
  }
}

function positive(money: Money, withCurrency: boolean): CaptureAmount | null {
  if (!money.isPositive()) return null;
  return { value: money.toFixed(), currency: withCurrency ? money.currency : null };
}

function mergeAmounts(
  field: CaptureAmount | null,
  fromText: Money | null,
  warn: (warning: CaptureDomainWarning) => void,
): CaptureAmount | null {
  if (fromText === null) return field;
  const text: CaptureAmount = { value: fromText.toFixed(), currency: fromText.currency };
  if (field === null) return text;

  const sameValue = field.value === text.value;
  if (sameValue && field.currency === null) return text;
  if (!sameValue || field.currency !== text.currency) warn('AMOUNT_MISMATCH');
  return field;
}

function lastFourOf(card: string | null): string | null {
  const groups = new Set(card?.match(LAST4) ?? []);
  const [only] = groups;
  return groups.size === 1 && only !== undefined ? only : null;
}
