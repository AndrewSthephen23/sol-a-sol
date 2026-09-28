import { DomainError } from '../errors/domain-error.js';

/**
 * Lector de CSV (RFC 4180) para la importación, sin dependencias: coma o punto y coma (se detecta
 * con la cabecera), comillas dobles con el separador, comillas dobladas o saltos de línea dentro,
 * finales de línea de Windows y la marca BOM que agrega Excel. Solo lee: qué significa cada celda
 * lo decide quien lo usa.
 */

export class MalformedCsvError extends DomainError {
  readonly code = 'MALFORMED_CSV';

  /** `line`: dónde está el problema, para señalarlo; `null` si es del archivo entero. */
  constructor(
    message: string,
    readonly line: number | null = null,
  ) {
    super(message);
  }
}

export interface CsvRow {
  /** Línea del archivo donde empieza la fila (la cabecera es la 1), para los mensajes. */
  line: number;
  cells: string[];
}

export interface CsvFile {
  header: string[];
  rows: CsvRow[];
}

const BOM = '﻿';
const QUOTE = '"';

export function readCsv(text: string): CsvFile {
  const content = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  const [header, ...rows] = parseRows(content, separatorOf(content)).filter(
    (row) => !row.cells.every((cell) => cell.trim() === ''),
  );
  if (header === undefined) throw new MalformedCsvError('The file has no header.');

  return { header: header.cells, rows };
}

/** `;` solo si la primera línea tiene más `;` que `,` fuera de comillas; si no, la coma. */
function separatorOf(content: string): string {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of content) {
    if (char === '\n' && !quoted) break;
    if (char === QUOTE) quoted = !quoted;
    if (!quoted && char === ',') commas += 1;
    if (!quoted && char === ';') semicolons += 1;
  }

  return semicolons > commas ? ';' : ',';
}

function parseRows(content: string, separator: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let line = 1;
  let rowLine = 1;
  let quoted = false;
  let quoteLine = 1;
  let closedQuote = false;

  const endRow = (): void => {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
    cells = [];
    cell = '';
    closedQuote = false;
  };

  // `!==` y no `<`: los saltos dobles (`""`, `\r\n`) avanzan uno de más, pero nunca pasan del final.
  for (let index = 0; index !== content.length; index += 1) {
    const char = content.charAt(index);
    const next = content.charAt(index + 1);

    if (quoted) {
      if (char === QUOTE && next === QUOTE) {
        cell += QUOTE;
        index += 1;
      } else if (char === QUOTE) {
        quoted = false;
        closedQuote = true;
      } else if (char !== '\r' || next !== '\n') {
        // El `\r` de un salto de Windows se descarta: dentro de comillas se lee como el de Unix.
        if (char === '\n') line += 1;
        cell += char;
      }
      continue;
    }

    if (char === separator) {
      cells.push(cell);
      cell = '';
      closedQuote = false;
    } else if (char === '\n' || (char === '\r' && next === '\n')) {
      if (char === '\r') index += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else if (closedQuote) {
      throw new MalformedCsvError(
        `Unexpected text after a closing quote on line ${String(line)}.`,
        line,
      );
    } else if (char === QUOTE && cell === '') {
      quoted = true;
      quoteLine = line;
    } else {
      cell += char;
    }
  }

  if (quoted) {
    throw new MalformedCsvError(
      `A quote opened on line ${String(quoteLine)} is never closed.`,
      quoteLine,
    );
  }
  endRow();

  return rows;
}
