import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { DomainError } from '@sol-a-sol/domain';
import { ZodError } from 'zod';

import { codeForStatus, titleForStatus } from './http-status-codes.js';
import {
  buildProblem,
  PROBLEM_CONTENT_TYPE,
  type ProblemDetails,
  type ProblemFieldError,
} from './problem-details.js';

/**
 * Estado HTTP de un error de dominio que no sea 422. Se agrega una entrada solo cuando el
 * significado del error lo pide (por ejemplo, un código de "no encontrado" que deba dar 404).
 */
const STATUS_BY_DOMAIN_CODE = new Map<string, number>([
  // El correo ya está tomado: es un conflicto con el estado actual, no un dato mal formado.
  ['EMAIL_ALREADY_REGISTERED', HttpStatus.CONFLICT],
  // No son datos mal formados: están bien escritos y aun así no autentican.
  ['INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED],
  ['INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED],
  ['TOTP_REQUIRED', HttpStatus.UNAUTHORIZED],
  ['INVALID_TOTP_CODE', HttpStatus.UNAUTHORIZED],
  ['TOTP_ALREADY_ENABLED', HttpStatus.CONFLICT],
  ['TOTP_NOT_STARTED', HttpStatus.CONFLICT],
  ['INVALID_PERSONAL_ACCESS_TOKEN', HttpStatus.UNAUTHORIZED],
  // Se sabe quién es, pero su token no puede hacer eso: 403, no 401.
  ['INSUFFICIENT_TOKEN_SCOPE', HttpStatus.FORBIDDEN],
  ['PERSONAL_ACCESS_TOKEN_NOT_FOUND', HttpStatus.NOT_FOUND],
]);

/** Una regla de negocio rechazó una petición bien formada: contenido no procesable. */
const DEFAULT_DOMAIN_STATUS = HttpStatus.UNPROCESSABLE_ENTITY;

const VALIDATION_CODE = 'VALIDATION_FAILED';

/** Lo mínimo que se necesita de la respuesta, para no atar el filtro a Express. */
interface HttpResponse {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

/**
 * Traduce cualquier excepción al formato Problem Details (RFC 9457).
 *
 * Nunca deja salir información interna: de un error inesperado el cliente solo recibe un 500
 * genérico, y el detalle real queda en el log del servidor.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const problem = this.toProblem(exception);

    response.status(problem.status);
    response.setHeader('Content-Type', PROBLEM_CONTENT_TYPE);
    response.json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ZodError) return validationProblem(exception);
    if (exception instanceof DomainError) return domainProblem(exception);
    if (exception instanceof HttpException) return httpProblem(exception);

    // Cualquier otra cosa es un fallo nuestro: se registra entero y se responde en genérico.
    this.logger.error('Excepción no controlada', exception);

    return buildProblem({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: codeForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
      title: titleForStatus(HttpStatus.INTERNAL_SERVER_ERROR),
      detail: 'The request could not be processed.',
    });
  }
}

function validationProblem(error: ZodError): ProblemDetails {
  return buildProblem({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: VALIDATION_CODE,
    title: 'Validation failed',
    detail: 'The request body does not match the expected shape.',
    errors: error.issues.map(toFieldError),
  });
}

function toFieldError(issue: ZodError['issues'][number]): ProblemFieldError {
  return {
    // Un error sobre el cuerpo entero (y no sobre un campo) llega con la ruta vacía.
    field: issue.path.map(String).join('.'),
    code: issue.code.toUpperCase(),
    message: issue.message,
  };
}

function domainProblem(error: DomainError): ProblemDetails {
  const status = STATUS_BY_DOMAIN_CODE.get(error.code) ?? DEFAULT_DOMAIN_STATUS;

  return buildProblem({
    status,
    code: error.code,
    title: titleForStatus(status),
    // El `message` de un error de dominio lo escribimos nosotros y describe la regla rota;
    // no trae datos del sistema, así que puede viajar.
    detail: error.message,
  });
}

function httpProblem(exception: HttpException): ProblemDetails {
  const status = exception.getStatus();

  return buildProblem({
    status,
    code: codeForStatus(status),
    title: titleForStatus(status),
    detail: detailOf(exception),
  });
}

function detailOf(exception: HttpException): string {
  const body: unknown = exception.getResponse();

  if (typeof body === 'string') return body;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join(' ');
  }

  return exception.message;
}
