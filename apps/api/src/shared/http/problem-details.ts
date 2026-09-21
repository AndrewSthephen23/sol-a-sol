/**
 * Problem Details para respuestas HTTP (RFC 9457), el formato de error de toda la API.
 *
 * Los textos (`title`, `detail`) van en inglés y son para quien depura: la interfaz en español
 * la arma la web traduciendo `code`, que es estable. Por eso `code` nunca cambia sin pensarlo.
 */

export {
  PROBLEM_CONTENT_TYPE,
  type ProblemDetails,
  type ProblemFieldError,
} from '@sol-a-sol/contracts';

const PROBLEM_TYPE_PREFIX = 'urn:sol-a-sol:error:';

/**
 * `type` identifica el tipo de error con un URN estable, no con una URL: no promete una página
 * que haya que mantener viva. El código se normaliza a minúsculas con guiones
 * (`INVALID_AMOUNT` → `urn:sol-a-sol:error:invalid-amount`); el valor canónico viaja en `code`.
 */
export function problemType(code: string): string {
  return `${PROBLEM_TYPE_PREFIX}${code.toLowerCase().replaceAll('_', '-')}`;
}

import type { ProblemDetails, ProblemFieldError } from '@sol-a-sol/contracts';

export interface BuildProblemInput {
  status: number;
  code: string;
  title: string;
  detail: string;
  errors?: ProblemFieldError[];
}

export function buildProblem({
  status,
  code,
  title,
  detail,
  errors,
}: BuildProblemInput): ProblemDetails {
  const problem: ProblemDetails = { type: problemType(code), title, status, detail };

  // `errors` solo aparece cuando hay fallos por campo: un arreglo vacío haría creer
  // a la web que hay detalles que mostrar.
  if (errors !== undefined && errors.length > 0) problem.errors = errors;

  return problem;
}
