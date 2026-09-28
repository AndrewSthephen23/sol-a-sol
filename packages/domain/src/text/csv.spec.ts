import { describe, expect, it } from 'vitest';

import { MalformedCsvError, readCsv } from './csv.js';

describe('readCsv', () => {
  it('reads the header and each row with the line it starts at', () => {
    expect(readCsv('fecha,monto\n2026-09-01,25.90\n2026-09-02,3.50\n')).toEqual({
      header: ['fecha', 'monto'],
      rows: [
        { line: 2, cells: ['2026-09-01', '25.90'] },
        { line: 3, cells: ['2026-09-02', '3.50'] },
      ],
    });
  });

  // Excel en español a veces guarda con `;`: se detecta con la cabecera.
  it('detects a semicolon separator from the header', () => {
    expect(readCsv('fecha;monto\n2026-09-01;25.90').rows).toEqual([
      { line: 2, cells: ['2026-09-01', '25.90'] },
    ]);
  });

  it('keeps commas inside the cells of a semicolon file', () => {
    expect(readCsv('monto;descripcion\n1,234.50;Pan, leche').rows[0]?.cells).toEqual([
      '1,234.50',
      'Pan, leche',
    ]);
  });

  // La coma entre comillas es parte del nombre de una columna, no un separador.
  it('does not count the separators inside quotes of the header', () => {
    expect(readCsv('"a,b";c\n1;2')).toEqual({
      header: ['a,b', 'c'],
      rows: [{ line: 2, cells: ['1', '2'] }],
    });
  });

  it('reads a Windows line break inside quotes as a plain one', () => {
    expect(readCsv('a,b\r\n"x\r\ny",1\r\nz,2').rows).toEqual([
      { line: 2, cells: ['x\ny', '1'] },
      { line: 4, cells: ['z', '2'] },
    ]);
  });

  it('keeps a lone carriage return inside a cell, quoted or not', () => {
    expect(readCsv('a\nx\ry').rows[0]?.cells).toEqual(['x\ry']);
    expect(readCsv('a,b\n"x\ry",1').rows[0]?.cells).toEqual(['x\ry', '1']);
  });

  it('keeps a quote in the middle of an unquoted cell as text', () => {
    expect(readCsv('a\nab"c').rows[0]?.cells).toEqual(['ab"c']);
  });

  it('prefers the comma when the header has as many of each', () => {
    expect(readCsv('a,b;c\n1,2;3').header).toEqual(['a', 'b;c']);
  });

  it('accepts Windows line endings and the BOM that Excel adds', () => {
    expect(readCsv('﻿fecha,monto\r\n2026-09-01,25.90\r\n')).toEqual({
      header: ['fecha', 'monto'],
      rows: [{ line: 2, cells: ['2026-09-01', '25.90'] }],
    });
  });

  it('reads quoted cells with the separator, doubled quotes and line breaks inside', () => {
    const csv = 'descripcion,monto\n"Menú ""ejecutivo"", 2 platos",25.90\n"Pan\nleche",3.00\n';

    expect(readCsv(csv).rows).toEqual([
      { line: 2, cells: ['Menú "ejecutivo", 2 platos', '25.90'] },
      { line: 3, cells: ['Pan\nleche', '3.00'] },
    ]);
  });

  it('counts the lines of a quoted line break for the rows that follow', () => {
    expect(readCsv('a\n"x\ny"\nz').rows.map((row) => row.line)).toEqual([2, 4]);
  });

  it('skips empty rows, also those that are only separators', () => {
    expect(readCsv('a,b\n\n1,2\n,\n  \n3,4').rows).toEqual([
      { line: 3, cells: ['1', '2'] },
      { line: 6, cells: ['3', '4'] },
    ]);
  });

  it('keeps the cells as they are, spaces included', () => {
    expect(readCsv('a,b\n x , y ').rows[0]?.cells).toEqual([' x ', ' y ']);
  });

  it('reads a file with only its header', () => {
    expect(readCsv('fecha,monto')).toEqual({ header: ['fecha', 'monto'], rows: [] });
  });

  it.each([
    ['empty', ''],
    ['blank', ' \n \n'],
    ['with an unclosed quote', 'a,b\n"sin cerrar,1'],
    ['with text right after a closing quote', 'a,b\n"x"y,1'],
  ])('rejects a file %s', (_case, csv) => {
    expect(() => readCsv(csv)).toThrow(MalformedCsvError);
  });

  it('says in which line the quote was left open', () => {
    expect(() => readCsv('a\nok\n"sin cerrar')).toThrow(/quote opened on line 3/);
  });

  it('says in which line there is text after a closing quote', () => {
    expect(() => readCsv('a,b\n"x"y,1')).toThrow(/after a closing quote on line 2/);
  });

  it('says that an empty file has no header', () => {
    expect(() => readCsv('')).toThrow(/no header/);
  });
});

describe('MalformedCsvError', () => {
  it('has a stable code', () => {
    const error = new MalformedCsvError('No header.');

    expect(error.code).toBe('MALFORMED_CSV');
    expect(error.message).toBe('No header.');
    expect(error.name).toBe('MalformedCsvError');
    expect(error.line).toBeNull();
  });

  it.each([
    ['an unclosed quote', 'a\nok\n"sin cerrar', 3],
    ['text after a closing quote', 'a,b\n"x"y,1', 2],
  ])('points at the line of %s', (_case, csv, line) => {
    expect(() => readCsv(csv)).toThrow(expect.objectContaining({ line }) as Error);
  });
});
