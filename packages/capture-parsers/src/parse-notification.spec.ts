import { Money } from '@sol-a-sol/domain';
import { describe, expect, it } from 'vitest';

import { type CaptureParser, type ParsedCapture } from './capture-parser.js';
import { parseNotification } from './parse-notification.js';

/** Un parser de prueba: reconoce los textos que empiezan con su nombre. */
function fakeParser(source: 'YAPE' | 'BCP', parse?: (text: string) => ParsedCapture) {
  const parser: CaptureParser = {
    source,
    matches: (text) => text.startsWith(source),
    parse:
      parse ??
      (() => ({
        source,
        kind: 'INCOME',
        amount: Money.of('20.00', 'PEN'),
        merchant: 'PERSONA EJEMPLO',
        cardLast4: null,
        warnings: [],
      })),
  };
  return parser;
}

function plain(parsed: ParsedCapture) {
  return { ...parsed, amount: parsed.amount?.toFixed() ?? null };
}

describe('parseNotification', () => {
  it('uses the parser that recognizes the text', () => {
    const result = parseNotification('BCP te abonó', [fakeParser('YAPE'), fakeParser('BCP')]);

    expect(plain(result)).toEqual({
      source: 'BCP',
      kind: 'INCOME',
      amount: '20.00',
      merchant: 'PERSONA EJEMPLO',
      cardLast4: null,
      warnings: [],
      text: 'BCP te abonó',
    });
  });

  it('uses the first parser when two recognize the text', () => {
    const first = fakeParser('YAPE');
    const second: CaptureParser = { ...fakeParser('BCP'), matches: () => true };

    expect(parseNotification('YAPE', [first, second]).source).toBe('YAPE');
  });

  it('falls back to a generic expense with a warning when no parser recognizes the text', () => {
    const result = parseNotification('Compra por US$ 12.00 en TIENDA', [fakeParser('YAPE')]);

    expect(plain(result)).toEqual({
      source: 'GENERIC',
      kind: 'EXPENSE',
      amount: '12.00',
      merchant: null,
      cardLast4: null,
      warnings: ['UNKNOWN_SOURCE'],
      text: 'Compra por US$ 12.00 en TIENDA',
    });
    expect(result.amount?.currency).toBe('USD');
  });

  it('adds the reason when the generic reading finds no amount', () => {
    expect(parseNotification('Pago de S/ 10.00 y comisión S/ 1.50', []).warnings).toEqual([
      'UNKNOWN_SOURCE',
      'AMBIGUOUS_AMOUNT',
    ]);
  });

  it('works with no parsers registered', () => {
    expect(parseNotification('S/ 5.00').source).toBe('GENERIC');
  });

  it('never throws: a failing parser falls back to the generic reading with a warning', () => {
    const broken = fakeParser('YAPE', () => {
      throw new Error('formato nuevo');
    });

    const result = parseNotification('YAPE S/ 8.00', [broken]);

    expect(result.source).toBe('GENERIC');
    expect(result.amount?.toFixed()).toBe('8.00');
    expect(result.warnings).toEqual(['PARSER_FAILED', 'UNKNOWN_SOURCE']);
  });

  it('never throws: a parser that fails to recognize is skipped', () => {
    const broken: CaptureParser = {
      ...fakeParser('YAPE'),
      matches: () => {
        throw new Error('regex rota');
      },
    };

    const result = parseNotification('BCP te abonó', [broken, fakeParser('BCP')]);

    expect(result.source).toBe('BCP');
    expect(result.warnings).toEqual(['PARSER_FAILED']);
  });

  it('masks a full card number before any parser sees it, and takes its last 4', () => {
    let seen = '';
    const spy = fakeParser('BCP', (text) => {
      seen = text;
      return {
        source: 'BCP',
        kind: 'EXPENSE',
        amount: null,
        merchant: null,
        cardLast4: null,
        warnings: ['AMOUNT_NOT_FOUND'],
      };
    });

    const result = parseNotification('BCP compra con 4111 1111 1111 4242', [spy]);

    expect(seen).toBe('BCP compra con ••••4242');
    expect(result.text).toBe('BCP compra con ••••4242');
    expect(result.cardLast4).toBe('4242');
    expect(result.warnings).toEqual(['AMOUNT_NOT_FOUND', 'CARD_NUMBER_MASKED']);
  });

  it('keeps the last 4 the parser found over the masked number', () => {
    const parser = fakeParser('BCP', () => ({
      source: 'BCP',
      kind: 'EXPENSE',
      amount: null,
      merchant: null,
      cardLast4: '1234',
      warnings: [],
    }));

    expect(parseNotification('BCP 4111111111114242', [parser]).cardLast4).toBe('1234');
  });

  it('masks a card number in a text no parser recognizes', () => {
    const result = parseNotification('Compra de S/ 50.00 con 4111111111111111', []);

    expect(result).toMatchObject({
      text: 'Compra de S/ 50.00 con ••••1111',
      cardLast4: '1111',
      warnings: ['UNKNOWN_SOURCE', 'CARD_NUMBER_MASKED'],
    });
  });
});
