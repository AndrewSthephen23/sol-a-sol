import { type Currency } from '../currency/currency.js';
import { searchKey } from '../text/search-key.js';
import { type TransactionType } from '../transactions/transaction-policy.js';
import { type CaptureAmount, type CaptureDomainWarning } from './capture-amount.js';

/** Lo que hace falta saber de un método de pago para reconocerlo. */
export interface PaymentMethodCandidate {
  id: string;
  alias: string;
  last4: string | null;
  archived: boolean;
}

/**
 * Reconoce el método de pago de una captura (decisión 4 de H7):
 *
 * 1. por los **últimos 4**, si coinciden con un solo método;
 * 2. si no, por el texto de la tarjeta **igual al alias**, sin tildes ni mayúsculas («BCP» no
 *    reconoce «Visa BCP»; decidido el 2026-10-04).
 *
 * Con dos candidatos o ninguno, no elige: se elige en la bandeja. Los **archivados no cuentan**
 * (decidido el 2026-10-04): una tarjeta cancelada no se usa en transacciones nuevas.
 */
export function matchPaymentMethod(
  methods: readonly PaymentMethodCandidate[],
  cardLast4: string | null,
  cardText: string | null,
): string | null {
  const active = methods.filter((method) => !method.archived);

  const byLast4 = active.filter((method) => cardLast4 !== null && method.last4 === cardLast4);
  if (byLast4.length === 1) return byLast4[0]?.id ?? null;

  const key = cardText === null ? null : searchKey(cardText);
  const byAlias = active.filter((method) => searchKey(method.alias) === key);
  return byAlias.length === 1 ? (byAlias[0]?.id ?? null) : null;
}

export interface CaptureCurrency {
  currency: Currency | null;
  warnings: CaptureDomainWarning[];
}

/**
 * La moneda de una captura (decisión 3 de H7): **la que dice el monto** o, si no dice ninguna,
 * la del método de pago si tiene una sola. Con un método bimoneda o sin método, queda sin
 * moneda y se elige en la bandeja. Nunca se suponen soles ni se convierte.
 *
 * Si el monto dice una y el método tiene otra, se respeta la del monto (puede ser un consumo en
 * dólares) con el aviso `CURRENCY_MISMATCH` (decidido el 2026-10-04).
 */
export function resolveCaptureCurrency(
  amount: CaptureAmount | null,
  paymentMethodCurrency: Currency | null,
): CaptureCurrency {
  const stated = amount?.currency ?? null;
  if (stated === null) return { currency: paymentMethodCurrency, warnings: [] };

  const differs = paymentMethodCurrency !== null && paymentMethodCurrency !== stated;
  return { currency: stated, warnings: differs ? ['CURRENCY_MISMATCH'] : [] };
}

/** Lo que hace falta saber de una regla de categorización y de su categoría. */
export interface CategorizationRuleCandidate {
  categoryId: string;
  categoryType: TransactionType;
  categoryArchived: boolean;
  /** `searchKey(pattern)`, como lo guarda la base. */
  patternKey: string;
  priority: number;
}

/**
 * La categoría que sugieren las reglas (decisión 12 de H7): las que **contiene** el comercio, o
 * el texto de la notificación si no hay comercio, sin tildes ni mayúsculas. Si aplican varias,
 * gana la de **mayor prioridad**; con la misma, la de **patrón más largo**; y si empatan también
 * en eso, la de patrón que va primero en orden alfabético, para que el resultado no dependa del
 * orden en que llegan.
 *
 * Solo cuentan las reglas cuya categoría es **del mismo tipo** que la captura y no está archivada
 * (decidido el 2026-10-04): las demás se saltan.
 */
export function suggestCategory(
  rules: readonly CategorizationRuleCandidate[],
  type: TransactionType,
  merchant: string | null,
  rawText: string | null,
): string | null {
  const target = merchant ?? rawText;
  if (target === null) return null;
  const key = searchKey(target);

  const [best] = rules
    .filter(
      (rule) =>
        rule.categoryType === type && !rule.categoryArchived && key.includes(rule.patternKey),
    )
    .toSorted(
      (a, b) =>
        b.priority - a.priority ||
        b.patternKey.length - a.patternKey.length ||
        a.patternKey.localeCompare(b.patternKey),
    );
  return best?.categoryId ?? null;
}
