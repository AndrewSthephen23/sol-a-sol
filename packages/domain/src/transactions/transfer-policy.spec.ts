import { describe, expect, it } from 'vitest';

import { InvalidAmountError, Money } from '../money/money.js';
import { TransactionCurrencyRequiredError } from './transaction-policy.js';
import {
  assertDistinctAccounts,
  NonPositiveTransferAmountError,
  resolveTransferAmounts,
  SameTransferAccountError,
  TransferCurrencyMismatchError,
  type TransferAmountsRequest,
  TransferReceivedAmountMismatchError,
  TransferReceivedAmountRequiredError,
} from './transfer-policy.js';

const SOLES = { currency: 'PEN' } as const;
const DOLLARS = { currency: 'USD' } as const;
/** Efectivo o tarjeta bimoneda: acepta las dos monedas. */
const ANY = { currency: null } as const;

function request(change: Partial<TransferAmountsRequest> = {}): TransferAmountsRequest {
  return {
    amount: '50.00',
    currency: null,
    receivedAmount: null,
    receivedCurrency: null,
    ...change,
  };
}

function plain({ sent, received }: { sent: Money; received: Money }) {
  return {
    sent: `${sent.toFixed()} ${sent.currency}`,
    received: `${received.toFixed()} ${received.currency}`,
  };
}

describe('assertDistinctAccounts', () => {
  it('accepts two different accounts', () => {
    expect(() => {
      assertDistinctAccounts('account-a', 'account-b');
    }).not.toThrow();
  });

  it('rejects moving money from an account to itself', () => {
    expect(() => {
      assertDistinctAccounts('account-a', 'account-a');
    }).toThrow(SameTransferAccountError);
  });
});

describe('resolveTransferAmounts', () => {
  describe('between accounts of the same currency', () => {
    it('receives exactly what was sent, in the currency of the accounts', () => {
      expect(plain(resolveTransferAmounts(request(), SOLES, SOLES))).toEqual({
        sent: '50.00 PEN',
        received: '50.00 PEN',
      });
    });

    it('accepts the received amount when it repeats the sent one', () => {
      const amounts = resolveTransferAmounts(request({ receivedAmount: '50' }), SOLES, SOLES);

      expect(plain(amounts).received).toBe('50.00 PEN');
    });

    // Sin cambio de moneda no hay de dónde sacar una diferencia: sería un dato mal copiado.
    it('rejects a received amount that differs from the sent one', () => {
      expect(() =>
        resolveTransferAmounts(request({ receivedAmount: '49.00' }), SOLES, SOLES),
      ).toThrow(TransferReceivedAmountMismatchError);
    });

    it('takes the currency sent when the accounts accept both', () => {
      const amounts = resolveTransferAmounts(request({ currency: 'USD' }), ANY, ANY);

      expect(plain(amounts)).toEqual({ sent: '50.00 USD', received: '50.00 USD' });
    });

    // De Yape a efectivo: el efectivo recibe lo que salió de Yape.
    it('receives in the currency sent when only the destination accepts both', () => {
      expect(plain(resolveTransferAmounts(request(), SOLES, ANY)).received).toBe('50.00 PEN');
    });
  });

  describe('changing currency', () => {
    it('keeps both amounts as copied from the voucher, converting nothing', () => {
      const amounts = resolveTransferAmounts(
        request({ amount: '37.50', receivedAmount: '10.00' }),
        SOLES,
        DOLLARS,
      );

      expect(plain(amounts)).toEqual({ sent: '37.50 PEN', received: '10.00 USD' });
    });

    it('also works the other way, from dollars to soles', () => {
      const amounts = resolveTransferAmounts(
        request({ amount: '10.00', receivedAmount: '37.20' }),
        DOLLARS,
        SOLES,
      );

      expect(plain(amounts)).toEqual({ sent: '10.00 USD', received: '37.20 PEN' });
    });

    it('takes the received currency sent when the destination accepts both', () => {
      const amounts = resolveTransferAmounts(
        request({ amount: '37.50', receivedAmount: '10.00', receivedCurrency: 'USD' }),
        SOLES,
        ANY,
      );

      expect(plain(amounts).received).toBe('10.00 USD');
    });

    // Nunca se calcula uno a partir del otro: el tipo de cambio lo pone el banco.
    it('requires the received amount', () => {
      expect(() => resolveTransferAmounts(request(), SOLES, DOLLARS)).toThrow(
        TransferReceivedAmountRequiredError,
      );
    });
  });

  describe('the currencies come from the accounts', () => {
    it('rejects a currency sent that the origin account does not hold', () => {
      expect(() => resolveTransferAmounts(request({ currency: 'USD' }), SOLES, SOLES)).toThrow(
        TransferCurrencyMismatchError,
      );
    });

    it('rejects a received currency that the destination account does not hold', () => {
      expect(() =>
        resolveTransferAmounts(
          request({ receivedAmount: '10.00', receivedCurrency: 'USD' }),
          SOLES,
          SOLES,
        ),
      ).toThrow(TransferCurrencyMismatchError);
    });

    it('accepts repeating the currencies of the accounts', () => {
      const amounts = resolveTransferAmounts(
        request({ currency: 'PEN', receivedAmount: '13.00', receivedCurrency: 'USD' }),
        SOLES,
        DOLLARS,
      );

      expect(plain(amounts)).toEqual({ sent: '50.00 PEN', received: '13.00 USD' });
    });

    // Como en una transacción: el dominio no supone soles.
    it('requires the currency when the origin accepts both', () => {
      expect(() => resolveTransferAmounts(request(), ANY, ANY)).toThrow(
        TransactionCurrencyRequiredError,
      );
    });
  });

  describe('the amounts', () => {
    it.each(['0', '-50.00'])('rejects the amount sent %s', (amount) => {
      expect(() => resolveTransferAmounts(request({ amount }), SOLES, SOLES)).toThrow(
        NonPositiveTransferAmountError,
      );
    });

    it.each(['0', '-10.00'])('rejects the amount received %s', (receivedAmount) => {
      expect(() => resolveTransferAmounts(request({ receivedAmount }), SOLES, DOLLARS)).toThrow(
        NonPositiveTransferAmountError,
      );
    });

    it('rejects a third decimal instead of rounding it', () => {
      expect(() =>
        resolveTransferAmounts(request({ receivedAmount: '10.005' }), SOLES, DOLLARS),
      ).toThrow(InvalidAmountError);
    });
  });
});

describe('errors', () => {
  it.each([
    [
      'SameTransferAccountError',
      () => new SameTransferAccountError(),
      'TRANSFER_SAME_ACCOUNT',
      /same account/,
    ],
    [
      'TransferCurrencyMismatchError',
      () => new TransferCurrencyMismatchError('USD', 'PEN'),
      'TRANSFER_CURRENCY_MISMATCH',
      /USD .* PEN account/,
    ],
    [
      'TransferReceivedAmountRequiredError',
      () => new TransferReceivedAmountRequiredError(),
      'TRANSFER_RECEIVED_AMOUNT_REQUIRED',
      /amount received is required/,
    ],
    [
      'TransferReceivedAmountMismatchError',
      () => new TransferReceivedAmountMismatchError(),
      'TRANSFER_RECEIVED_AMOUNT_MISMATCH',
      /same currency/,
    ],
    [
      'NonPositiveTransferAmountError',
      () => new NonPositiveTransferAmountError(),
      'TRANSFER_AMOUNT_NOT_POSITIVE',
      /greater than zero/,
    ],
  ])('%s has a stable code and says which rule broke', (name, build, code, message) => {
    const error = build();

    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    expect(error.name).toBe(name);
  });
});
