import { type CaptureParser } from './capture-parser.js';

/**
 * Los parsers de cada fuente, en el orden en que se prueban. Llegan con las tareas 03 (Yape y
 * BCP) y 04 (Interbank, Lemon y Plin), cada uno con sus fixtures.
 */
export const PARSERS: readonly CaptureParser[] = [];
