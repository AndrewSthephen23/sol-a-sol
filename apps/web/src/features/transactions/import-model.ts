import { assertValidPaymentMethod, DomainError } from '@sol-a-sol/domain';

import type { paths } from '@/shared/api/schema.gen';
import type { Currency } from '@/shared/format/money';

export type ImportPreview =
  paths['/api/v1/transactions/import/preview']['post']['responses'][200]['content']['application/json'];
export type ImportResult =
  paths['/api/v1/transactions/import']['post']['responses'][201]['content']['application/json'];
export type ImportRequest =
  paths['/api/v1/transactions/import']['post']['requestBody']['content']['application/json'];
type CategoryDecision = NonNullable<ImportRequest['categories']>[number];
type PaymentMethodDecision = NonNullable<ImportRequest['paymentMethods']>[number];

export type PendingCategory = ImportPreview['categories'][number];
export type PendingMethod = ImportPreview['paymentMethods'][number];
export type RowProblem = ImportPreview['problems'][number];
export type PaymentMethodKind = 'ACCOUNT' | 'WALLET' | 'CREDIT_CARD' | 'CASH';

/** Límite de la API, medido en bytes: se revisa antes de mandar el archivo. */
export const IMPORT_MAX_BYTES = 1_048_576;

export const KIND_LABELS: Readonly<Record<PaymentMethodKind, string>> = {
  ACCOUNT: 'Cuenta bancaria',
  WALLET: 'Billetera (Yape, Plin)',
  CREDIT_CARD: 'Tarjeta de crédito',
  CASH: 'Efectivo',
};

// --- Problemas de cada fila -------------------------------------------------------------------

/**
 * Qué dice cada problema de una fila, en español. La API los manda con su `message` en inglés,
 * que es para depurar: **nunca** se muestra.
 */
const ROW_PROBLEMS: Readonly<Record<string, string>> = {
  IMPORT_FIELD_REQUIRED: 'Falta este dato.',
  IMPORT_FIELD_NOT_ALLOWED: 'Esta columna va vacía en este tipo de fila.',
  IMPORT_FIELD_TOO_LONG: 'Es demasiado largo.',
  IMPORT_TYPE_UNKNOWN:
    'Tipo desconocido: usa Ingreso, Gasto fijo, Gasto variable, Ahorro, Inversión, Deuda o Transferencia.',
  IMPORT_CURRENCY_MISMATCH: 'El símbolo del monto no coincide con la columna moneda.',
  INVALID_LOCAL_DATE: 'La fecha va como AAAA-MM-DD, por ejemplo 2026-09-17.',
  TRANSACTION_DATE_IN_FUTURE: 'La fecha es futura: solo se registra lo que ya pasó.',
  INVALID_AMOUNT_TEXT: 'El monto va con punto decimal, por ejemplo 25.90.',
  INVALID_AMOUNT: 'El monto tiene más de 2 decimales.',
  TRANSACTION_AMOUNT_NOT_POSITIVE: 'El monto tiene que ser mayor que cero.',
  TRANSFER_AMOUNT_NOT_POSITIVE: 'El monto tiene que ser mayor que cero.',
  TAG_NAME_INVALID: 'Alguna etiqueta no es válida.',
  TOO_MANY_TAGS: 'Tiene más de 10 etiquetas.',
  TRANSFER_SAME_ACCOUNT: 'Sale y llega a la misma cuenta.',
  TRANSFER_CURRENCY_MISMATCH: 'La moneda no es la de la cuenta.',
  TRANSFER_RECEIVED_AMOUNT_REQUIRED: 'La moneda cambia: falta monto_destino, copiado del voucher.',
  TRANSFER_RECEIVED_AMOUNT_MISMATCH: 'En la misma moneda, monto_destino es igual al monto.',
};

export function rowProblemMessage(problem: RowProblem): string {
  return ROW_PROBLEMS[problem.code] ?? 'Este valor no es válido.';
}

/** Errores del archivo entero o de la confirmación, en español. */
const FILE_ERRORS: Readonly<Record<string, string>> = {
  MALFORMED_CSV: 'El archivo no es un CSV válido. Guárdalo como «CSV UTF-8» y vuelve a elegirlo.',
  IMPORT_COLUMNS_MISSING:
    'Al archivo le faltan columnas obligatorias: fecha, tipo, monto, moneda y descripcion.',
  IMPORT_FILE_TOO_LARGE: 'El archivo pasa de 1 MB. Divídelo en partes.',
  IMPORT_TOO_MANY_ROWS: 'El archivo pasa de 5 000 filas. Divídelo en partes.',
  IMPORT_HAS_PROBLEMS: 'Hay filas con problemas. Corrígelas en el archivo y vuelve a elegirlo.',
  IMPORT_UNRESOLVED: 'Falta decidir qué hacer con alguna categoría o método de pago.',
  IMPORT_DECISION_INVALID:
    'Alguna decisión ya no vale (algo cambió en tu cuenta). Vuelve a previsualizar el archivo.',
  IMPORT_CONFLICT:
    'Otra importación guardó a la vez algunas de estas filas y no se guardó nada. Vuelve a previsualizar: lo que ya entró se omitirá.',
  TRANSFER_SAME_ACCOUNT:
    'Con esas decisiones, alguna transferencia saldría y llegaría a la misma cuenta.',
  TRANSFER_CURRENCY_MISMATCH:
    'Con esas decisiones, alguna transferencia no coincide con la moneda de su cuenta.',
  PAYMENT_METHOD_ALIAS_TAKEN: 'Ya existe un método de pago con ese alias.',
};

export function importErrorMessage(code: string | null): string | null {
  return code === null ? null : (FILE_ERRORS[code] ?? null);
}

// --- Decisiones --------------------------------------------------------------------------------

export type CategoryChoice =
  { action: 'create' } | { action: 'restore' } | { action: 'use'; categoryId: string };

export interface NewMethod {
  kind: PaymentMethodKind | '';
  institution: string;
  last4: string;
  /** `BOTH`: tarjeta o efectivo que aceptan soles y dólares. */
  currency: Currency | 'BOTH' | '';
}

export type MethodChoice =
  | ({ action: 'create' } & NewMethod)
  | { action: 'restore' }
  | { action: 'use'; paymentMethodId: string };

/** Cómo se identifica una categoría pendiente: igual que en la API, sin mayúsculas ni tildes. */
export function categoryKey(category: Pick<PendingCategory, 'type' | 'category' | 'subcategory'>) {
  return [category.type, category.category, category.subcategory ?? ''].join('/');
}

/**
 * La decisión que se propone para cada pendiente: crear lo que falta y restaurar lo archivado.
 * Se ve y se cambia antes de confirmar; un método nuevo igual exige elegir su tipo.
 */
export function proposedDecisions(preview: ImportPreview): {
  categories: Record<string, CategoryChoice>;
  methods: Record<string, MethodChoice>;
} {
  return {
    categories: Object.fromEntries(
      preview.categories.map((pending) => [
        categoryKey(pending),
        pending.status === 'missing' ? { action: 'create' } : { action: 'restore' },
      ]),
    ),
    methods: Object.fromEntries(
      preview.paymentMethods.map((pending) => [
        pending.alias,
        pending.status === 'missing'
          ? { action: 'create', kind: '', institution: '', last4: '', currency: '' }
          : { action: 'restore' },
      ]),
    ),
  };
}

/** Por qué no vale un método nuevo, en español, con las reglas del dominio. */
const METHOD_ERRORS: Readonly<Record<string, string>> = {
  INVALID_LAST4: 'Los últimos dígitos son exactamente 4 números.',
  LAST4_REQUIRED: 'Una tarjeta de crédito necesita sus últimos 4 dígitos.',
  LAST4_NOT_ALLOWED: 'Este tipo de método no tiene últimos 4 dígitos.',
  PAYMENT_METHOD_CURRENCY_REQUIRED: 'Una cuenta o billetera guarda una sola moneda: elígela.',
  INSTITUTION_NOT_ALLOWED: 'El efectivo no tiene banco.',
};

function methodDetails(method: NewMethod & { kind: PaymentMethodKind }) {
  const institution = method.kind === 'CASH' ? '' : method.institution.trim();
  const last4 = method.last4.trim();

  return {
    kind: method.kind,
    institution: institution === '' ? null : institution,
    last4: last4 === '' ? null : last4,
    currency: method.currency === 'BOTH' || method.currency === '' ? null : method.currency,
  };
}

/** Qué falta o está mal en cada decisión, por su clave. Vacío: se puede confirmar. */
export function checkDecisions(
  categories: Record<string, CategoryChoice>,
  methods: Record<string, MethodChoice>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, choice] of Object.entries(categories)) {
    if (choice.action === 'use' && choice.categoryId === '') errors[key] = 'Elige una categoría.';
  }
  for (const [alias, choice] of Object.entries(methods)) {
    if (choice.action === 'use' && choice.paymentMethodId === '') {
      errors[alias] = 'Elige un método de pago.';
    } else if (choice.action === 'create') {
      if (choice.kind === '') {
        errors[alias] = 'Elige qué tipo de método es.';
        continue;
      }
      if (choice.currency === '') {
        errors[alias] = 'Elige la moneda.';
        continue;
      }
      try {
        assertValidPaymentMethod(methodDetails({ ...choice, kind: choice.kind }));
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        errors[alias] = METHOD_ERRORS[error.code] ?? 'Revisa los datos del método.';
      }
    }
  }

  return errors;
}

/** El cuerpo de la confirmación: el mismo archivo y una decisión por cada pendiente. */
export function importRequest(
  csv: string,
  preview: ImportPreview,
  categories: Record<string, CategoryChoice>,
  methods: Record<string, MethodChoice>,
): ImportRequest {
  return {
    csv,
    categories: preview.categories.flatMap((pending): CategoryDecision[] => {
      const choice = categories[categoryKey(pending)];
      if (choice === undefined) return [];
      const target = {
        type: pending.type,
        category: pending.category,
        subcategory: pending.subcategory,
      };

      return [
        choice.action === 'use' ? { ...target, ...choice } : { ...target, action: choice.action },
      ];
    }),
    paymentMethods: preview.paymentMethods.flatMap((pending): PaymentMethodDecision[] => {
      const choice = methods[pending.alias];
      if (choice === undefined) return [];
      if (choice.action === 'use') {
        return [{ alias: pending.alias, action: 'use', paymentMethodId: choice.paymentMethodId }];
      }
      if (choice.action === 'restore') return [{ alias: pending.alias, action: 'restore' }];
      // Sin tipo no se puede crear: `checkDecisions` lo frena antes. Si llegara aquí, se omite y
      // la API responde `IMPORT_UNRESOLVED`; nunca se convierte en otra decisión en silencio.
      if (choice.kind === '') return [];

      return [
        {
          alias: pending.alias,
          action: 'create',
          ...methodDetails({ ...choice, kind: choice.kind }),
        },
      ];
    }),
  };
}
